import { describe, expect, it } from "vitest";

import type {
  Benchmark,
  Measurement,
  Model,
} from "../../src/lib/schema";
import {
  buildScaffolds,
  buildSeedLedger,
  classifyNew,
  countNewIds,
  deriveIdPrefix,
  diffAgainstLedger,
  extractAaSlug,
  LedgerEntrySchema,
  LedgerFileSchema,
  parseAaModels,
  renderPrBody,
  renderPrTitle,
  stripVariantSuffix,
  validateLedgerConsistency,
  type AaModel,
  type LedgerFile,
} from "./core";
import fixture from "./fixtures/aa-models.sample.json";

const TODAY = "2026-07-24";

function makeModel(overrides: Partial<Model> & Pick<Model, "id" | "lab">): Model {
  return {
    name: overrides.id,
    releaseDate: "2026-01-01",
    openWeights: false,
    url: "https://example.com/announcement",
    ...overrides,
  };
}

function makeMeasurement(modelId: string, aaSlug: string): Measurement {
  return {
    modelId,
    benchmarkId: "gpqa-diamond",
    publisherId: "artificial-analysis",
    value: 90,
    source: {
      url: `https://artificialanalysis.ai/models/${aaSlug}#intelligence-breakdown`,
      retrieved: "2026-07-17",
    },
  };
}

const MODELS: Model[] = [
  makeModel({ id: "openai-gpt-5-6-sol", name: "GPT-5.6 Sol", lab: "OpenAI" }),
  makeModel({ id: "anthropic-claude-fable-5", name: "Claude Fable 5", lab: "Anthropic" }),
  makeModel({ id: "kimi-k3", name: "Kimi K3", lab: "Moonshot AI" }),
  makeModel({ id: "xai-grok-4-5", name: "Grok 4.5", lab: "xAI" }),
  makeModel({ id: "mistral-large-3", name: "Mistral Large 3", lab: "Mistral AI" }),
];

const MEASUREMENTS: Measurement[] = [
  makeMeasurement("openai-gpt-5-6-sol", "gpt-5-6-sol"),
  makeMeasurement("anthropic-claude-fable-5", "claude-fable-5"),
  makeMeasurement("kimi-k3", "kimi-k3"),
  makeMeasurement("xai-grok-4-5", "grok-4-5"),
];

const BENCHMARKS: Benchmark[] = [
  {
    id: "gpqa-diamond",
    name: "GPQA Diamond",
    category: "reasoning",
    description: "Graduate-level science questions",
    unit: "percent",
    sourceUrl: "https://example.com/gpqa",
  },
  {
    id: "scicode",
    name: "SciCode",
    category: "coding",
    description: "Scientific coding",
    unit: "percent",
    sourceUrl: "https://example.com/scicode",
  },
];

const AA_ALL = parseAaModels(fixture);
const AA_KNOWN = AA_ALL.slice(0, 4);

function seededLedger(): LedgerFile {
  return buildSeedLedger(AA_KNOWN, MODELS, MEASUREMENTS, TODAY).ledger;
}

describe("parseAaModels", () => {
  it("accepts the documented { data: [...] } envelope and strips unknown fields", () => {
    expect(AA_ALL).toHaveLength(8);
    expect(AA_ALL[0]).not.toHaveProperty("median_output_tokens_per_second");
  });

  it("accepts a bare array", () => {
    const models = parseAaModels([
      {
        id: "x1",
        name: "X",
        slug: "x",
        model_creator: { name: "X Lab", slug: "x-lab" },
      },
    ]);

    expect(models[0].slug).toBe("x");
  });

  it("accepts opaque upstream slugs without treating them as local ids", () => {
    const models = parseAaModels([
      {
        id: "x1",
        name: "QwQ 32B Preview",
        slug: "QwQ-32B-Preview",
        model_creator: { name: "ByteDance Seed", slug: "bytedance_seed" },
      },
      {
        id: "x2",
        name: "GLM 4.5",
        slug: "glm-4.5",
        model_creator: { name: "Z AI", slug: "zai" },
      },
    ]);

    expect(models.map((model) => model.slug)).toEqual([
      "QwQ-32B-Preview",
      "glm-4.5",
    ]);
  });

  it("rejects entries missing required fields", () => {
    expect(() => parseAaModels({ data: [{ id: "x1", name: "X" }] })).toThrow();
  });
});

describe("extractAaSlug", () => {
  it("extracts the slug from AA model pages", () => {
    expect(
      extractAaSlug("https://artificialanalysis.ai/models/gpt-5-6-sol#intelligence-breakdown"),
    ).toBe("gpt-5-6-sol");
    expect(extractAaSlug("https://www.artificialanalysis.ai/models/kimi-k3")).toBe("kimi-k3");
    expect(extractAaSlug("https://artificialanalysis.ai/models/glm-5/prompt-options")).toBe("glm-5");
    expect(extractAaSlug("https://artificialanalysis.ai/models/QwQ-32B-Preview")).toBe(
      "QwQ-32B-Preview",
    );
    expect(extractAaSlug("https://artificialanalysis.ai/models/glm-4.5")).toBe("glm-4.5");
  });

  it("returns null for non-AA-model-page URLs", () => {
    expect(extractAaSlug("https://openai.com/index/gpt-5-6/")).toBeNull();
    expect(extractAaSlug("https://artificialanalysis.ai/leaderboards/models")).toBeNull();
  });
});

describe("buildSeedLedger", () => {
  it("matches existing models by AA slug and marks the rest as backlog", () => {
    const seed = buildSeedLedger(AA_ALL, MODELS, MEASUREMENTS, TODAY);

    expect(seed.matched).toHaveLength(4);
    expect(seed.backlogCount).toBe(4);
    expect(seed.ledger.entries).toHaveLength(8);

    const added = seed.ledger.entries.filter((entry) => entry.status === "added");

    expect(added.map((entry) => entry.modelId)).toEqual([
      "openai-gpt-5-6-sol",
      "anthropic-claude-fable-5",
      "kimi-k3",
      "xai-grok-4-5",
    ]);

    const ignored = seed.ledger.entries.filter((entry) => entry.status === "ignored");

    expect(ignored.every((entry) => entry.modelId === undefined)).toBe(true);
    expect(ignored.every((entry) => entry.note?.includes("pre-automation backlog"))).toBe(true);
  });

  it("reports local models with no live upstream entry", () => {
    const seed = buildSeedLedger(AA_ALL, MODELS, MEASUREMENTS, TODAY);

    expect(seed.unmatchedModelIds).toEqual(["mistral-large-3"]);
  });

  it("throws when two models claim the same AA slug", () => {
    const conflicting = [
      ...MEASUREMENTS,
      makeMeasurement("mistral-large-3", "gpt-5-6-sol"),
    ];

    expect(() => buildSeedLedger(AA_ALL, MODELS, conflicting, TODAY)).toThrow(/Seed conflict/);
  });

  it("produces a ledger that passes the file schema", () => {
    const seed = buildSeedLedger(AA_ALL, MODELS, MEASUREMENTS, TODAY);

    expect(() => LedgerFileSchema.parse(seed.ledger)).not.toThrow();
  });
});

describe("diffAgainstLedger", () => {
  it("returns only entries whose AA id is not in the ledger", () => {
    const fresh = diffAgainstLedger(AA_ALL, seededLedger());

    expect(fresh.map((aaModel) => aaModel.slug)).toEqual([
      "gpt-5-7",
      "grok-5-high",
      "grok-5-low",
      "nova-2-pro",
    ]);
  });

  it("returns nothing when everything has been seen", () => {
    const fullLedger = buildSeedLedger(
      AA_ALL,
      MODELS,
      MEASUREMENTS,
      TODAY,
    ).ledger;

    expect(diffAgainstLedger(AA_ALL, fullLedger)).toHaveLength(0);
  });
});

describe("stripVariantSuffix", () => {
  it("removes a trailing parenthetical", () => {
    expect(stripVariantSuffix("gpt-oss 20B (high)")).toBe("gpt-oss 20B");
    expect(stripVariantSuffix("Grok 5 (low)")).toBe("Grok 5");
  });

  it("leaves other names untouched", () => {
    expect(stripVariantSuffix("GPT-5.7")).toBe("GPT-5.7");
    expect(stripVariantSuffix("Claude (Sonnet) Legacy Edition")).toBe(
      "Claude (Sonnet) Legacy Edition",
    );
  });
});

describe("classifyNew", () => {
  it("scaffolds tracked creators, auto-ignores unknown ones, and groups variants", () => {
    const ledger = seededLedger();
    const { candidates, autoIgnored } = classifyNew(diffAgainstLedger(AA_ALL, ledger), ledger);

    expect(candidates).toHaveLength(2);
    expect(autoIgnored.map((aaModel) => aaModel.slug)).toEqual(["nova-2-pro"]);

    const grok = candidates.find((group) => group.baseName === "Grok 5");

    expect(grok?.variants.map((variant) => variant.slug)).toEqual(["grok-5-high", "grok-5-low"]);
    expect(grok?.primary.slug).toBe("grok-5-low");
  });

  it("prefers the variant whose name matches the base name exactly", () => {
    const variants: AaModel[] = [
      {
        id: "v1",
        name: "X (high)",
        slug: "x-high",
        model_creator: { name: "OpenAI", slug: "openai" },
      },
      {
        id: "v2",
        name: "X",
        slug: "x-extremely-long-slug",
        model_creator: { name: "OpenAI", slug: "openai" },
      },
    ];

    const { candidates } = classifyNew(variants, seededLedger());

    expect(candidates).toHaveLength(1);
    expect(candidates[0].primary.slug).toBe("x-extremely-long-slug");
  });
});

describe("deriveIdPrefix", () => {
  it("derives the dominant prefix from existing pairs", () => {
    const ledger = seededLedger();

    expect(deriveIdPrefix("openai", ledger)).toBe("openai-");
    expect(deriveIdPrefix("moonshot-ai", ledger)).toBe("");
    expect(deriveIdPrefix("xai", ledger)).toBe("xai-");
  });

  it("falls back to the creator slug for unseen creators", () => {
    expect(deriveIdPrefix("amazon", seededLedger())).toBe("amazon-");
    expect(deriveIdPrefix("ByteDance_Seed", seededLedger())).toBe(
      "bytedance-seed-",
    );
  });

  it("derives prefixes from normalized upstream slugs", () => {
    const ledger: LedgerFile = {
      source: "https://example.com",
      entries: [
        {
          aaId: "dotted",
          aaSlug: "GPT.5_Test",
          aaName: "GPT 5 Test",
          creator: "openai",
          status: "added",
          modelId: "openai-gpt-5-test",
          firstSeen: TODAY,
        },
      ],
    };

    expect(deriveIdPrefix("openai", ledger)).toBe("openai-");
  });

  it("picks the most frequent prefix when mixed", () => {
    const ledger: LedgerFile = {
      source: "https://example.com",
      entries: [
        {
          aaId: "a",
          aaSlug: "medium-3-5",
          aaName: "Medium 3.5",
          creator: "mistral",
          status: "added",
          modelId: "mistral-medium-3-5",
          firstSeen: TODAY,
        },
        {
          aaId: "b",
          aaSlug: "large-3",
          aaName: "Large 3",
          creator: "mistral",
          status: "added",
          modelId: "mistral-large-3",
          firstSeen: TODAY,
        },
        {
          aaId: "c",
          aaSlug: "devstral-2",
          aaName: "Devstral 2",
          creator: "mistral",
          status: "added",
          modelId: "devstral-2",
          firstSeen: TODAY,
        },
      ],
    };

    expect(deriveIdPrefix("mistral", ledger)).toBe("mistral-");
  });
});

describe("buildScaffolds", () => {
  function scaffoldFixture(models: Model[] = MODELS) {
    const ledger = seededLedger();
    const classification = classifyNew(diffAgainstLedger(AA_ALL, ledger), ledger);

    return buildScaffolds(classification, ledger, models, TODAY);
  }

  it("maps complete upstream metadata with only the url flag", () => {
    const { scaffolds } = scaffoldFixture();
    const gpt = scaffolds.find((scaffold) => scaffold.model.id === "openai-gpt-5-7");

    expect(gpt?.model).toEqual({
      id: "openai-gpt-5-7",
      name: "GPT-5.7",
      lab: "OpenAI",
      releaseDate: "2026-07-20",
      openWeights: false,
      contextWindow: 1050000,
      url: "https://artificialanalysis.ai/models/gpt-5-7",
    });
    expect(gpt?.flags).toHaveLength(2);
    expect(gpt?.flags[0]).toMatch(/MUST replace/);
    expect(gpt?.flags[1]).toMatch(/first-party documentation/);
  });

  it("falls back and flags when upstream metadata is missing", () => {
    const { scaffolds } = scaffoldFixture();
    const grok = scaffolds.find((scaffold) => scaffold.model.id === "xai-grok-5-low");

    expect(grok?.model.name).toBe("Grok 5");
    expect(grok?.model.lab).toBe("xAI");
    expect(grok?.model.releaseDate).toBe(TODAY);
    expect(grok?.model.openWeights).toBe(false);
    expect(grok?.model.contextWindow).toBeUndefined();
    expect(grok?.model.pricing).toBeUndefined();
    expect(grok?.variants).toHaveLength(2);

    const flagged = grok?.flags.join("\n");

    expect(flagged).toMatch(/releaseDate unknown upstream/);
    expect(flagged).toMatch(/openWeights unknown upstream/);
    expect(flagged).toMatch(/contextWindow unknown upstream/);
    expect(flagged).toMatch(/\$0\/\$0 upstream/);
  });

  it("defaults a YYYY-MM release date to the first of the month with a flag", () => {
    const ledger = seededLedger();
    const monthOnly: AaModel[] = [
      {
        id: "m1",
        name: "GPT-5.8",
        slug: "gpt-5-8",
        model_creator: { name: "OpenAI", slug: "openai" },
        release_date: "2026-08",
      },
    ];

    const { scaffolds } = buildScaffolds(
      classifyNew(monthOnly, ledger),
      ledger,
      MODELS,
      TODAY,
    );

    expect(scaffolds[0].model.releaseDate).toBe("2026-08-01");
    expect(scaffolds[0].flags.join("\n")).toMatch(/day defaulted to 01/);
  });

  it("normalizes opaque upstream slugs when deriving local model ids", () => {
    const ledger = seededLedger();
    const dottedSlug: AaModel[] = [
      {
        id: "dotted-1",
        name: "GPT 5 Test",
        slug: "GPT.5_Test",
        model_creator: { name: "OpenAI", slug: "openai" },
      },
    ];

    const { scaffolds, ledgerRows } = buildScaffolds(
      classifyNew(dottedSlug, ledger),
      ledger,
      MODELS,
      TODAY,
    );

    expect(scaffolds[0].model.id).toBe("openai-gpt-5-test");
    expect(scaffolds[0].aaPageUrl).toBe(
      "https://artificialanalysis.ai/models/GPT.5_Test",
    );
    expect(ledgerRows[0].aaSlug).toBe("GPT.5_Test");
  });

  it("suffixes and flags colliding ids", () => {
    const withCollision = [...MODELS, makeModel({ id: "openai-gpt-5-7", lab: "OpenAI" })];
    const { scaffolds } = scaffoldFixture(withCollision);
    const gpt = scaffolds.find((scaffold) => scaffold.model.name === "GPT-5.7");

    expect(gpt?.model.id).toBe("openai-gpt-5-7-2");
    expect(gpt?.flags.join("\n")).toMatch(/MUST rename/);
  });

  it("emits one 'added' ledger row per variant and 'ignored' rows for untracked providers", () => {
    const result = scaffoldFixture();

    expect(countNewIds(result)).toBe(4);

    const grokRows = result.ledgerRows.filter((row) => row.aaSlug.startsWith("grok-5"));

    expect(grokRows).toHaveLength(2);
    expect(new Set(grokRows.map((row) => row.modelId))).toEqual(new Set(["xai-grok-5-low"]));

    const nova = result.ledgerRows.find((row) => row.aaSlug === "nova-2-pro");

    expect(nova?.status).toBe("ignored");
    expect(nova?.modelId).toBeUndefined();
    expect(nova?.note).toBe("provider not tracked (auto)");
  });

  it("flags a slug previously recorded under a different AA id", () => {
    const ledger = seededLedger();
    const reissued: AaModel[] = [
      {
        id: "brand-new-aa-id",
        name: "Kimi K3",
        slug: "kimi-k3",
        model_creator: { name: "Moonshot AI", slug: "moonshot-ai" },
      },
    ];

    const { scaffolds } = buildScaffolds(
      classifyNew(reissued, ledger),
      ledger,
      MODELS,
      TODAY,
    );

    expect(scaffolds[0].flags.join("\n")).toMatch(/possible upstream re-issue/);
  });
});

describe("ledger schemas", () => {
  const baseEntry = {
    aaId: "a1",
    aaSlug: "some-model",
    aaName: "Some Model",
    creator: "some-lab",
    firstSeen: TODAY,
  };

  it("requires modelId on added entries and forbids it on ignored ones", () => {
    expect(() => LedgerEntrySchema.parse({ ...baseEntry, status: "added" })).toThrow();
    expect(() =>
      LedgerEntrySchema.parse({ ...baseEntry, status: "ignored", modelId: "some-model" }),
    ).toThrow();
    expect(() =>
      LedgerEntrySchema.parse({ ...baseEntry, status: "added", modelId: "some-model" }),
    ).not.toThrow();
  });

  it("rejects duplicate aaIds", () => {
    const entry = { ...baseEntry, status: "ignored" };

    expect(() =>
      LedgerFileSchema.parse({ source: "https://example.com", entries: [entry, entry] }),
    ).toThrow(/Duplicate aaId/);
  });
});

describe("validateLedgerConsistency", () => {
  it("flags added entries whose model no longer exists", () => {
    const ledger = seededLedger();
    const withoutGpt = MODELS.filter((model) => model.id !== "openai-gpt-5-6-sol");
    const errors = validateLedgerConsistency(ledger, withoutGpt);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/gpt-5-6-sol/);
    expect(validateLedgerConsistency(ledger, MODELS)).toHaveLength(0);
  });
});

describe("rendering", () => {
  function rendered() {
    const ledger = seededLedger();
    const classification = classifyNew(diffAgainstLedger(AA_ALL, ledger), ledger);
    const result = buildScaffolds(classification, ledger, MODELS, TODAY);

    return { result, classification, body: renderPrBody(result, classification, BENCHMARKS, TODAY) };
  }

  it("titles PRs by scaffold count", () => {
    const { result } = rendered();

    expect(renderPrTitle(result, TODAY)).toBe(
      `data: scaffold 2 upstream models — needs curation (${TODAY})`,
    );
    expect(renderPrTitle({ scaffolds: [], ledgerRows: [result.ledgerRows[3]] }, TODAY)).toBe(
      `data: record 1 new upstream model — none scaffolded (${TODAY})`,
    );
  });

  it("renders attribution, per-model checklists, and the not-scaffolded section", () => {
    const { body } = rendered();

    expect(body).toContain("[Artificial Analysis](https://artificialanalysis.ai/)");
    expect(body).toContain("### GPT-5.7 (`openai-gpt-5-7`)");
    expect(body).toContain("### Grok 5 (`xai-grok-5-low`)");
    expect(body).toContain("- [ ] `gpqa-diamond`");
    expect(body).toContain("- [ ] `scicode`");
    expect(body).toContain("Seen upstream, not scaffolded (1)");
    expect(body).toContain("Nova 2 Pro");
    expect(body).toContain("## Reviewer protocol");
    expect(body).toMatch(/reasoningEffort/);
  });
});
