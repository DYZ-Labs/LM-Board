import { z } from "zod";

import {
  ModelSchema,
  type Benchmark,
  type Model,
  type Score,
} from "../../src/lib/schema";

export const AA_MODELS_ENDPOINT =
  "https://artificialanalysis.ai/api/v2/data/llms/models";

/**
 * Abort instead of opening an oversized PR when the upstream list churns
 * en masse (e.g. Artificial Analysis regenerates its ids).
 */
export const MAX_NEW_MODELS_PER_RUN = 25;

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase, kebab-case slug");

// Artificial Analysis slugs are opaque upstream identifiers. Most are
// lowercase kebab-case, but the live API also contains dots, uppercase
// characters, and underscores (for example `glm-4.5`, `QwQ-32B-Preview`,
// and the creator slug `bytedance_seed`).
const upstreamSlugSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/,
    "Must be a non-empty Artificial Analysis slug",
  );

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must use YYYY-MM-DD format");

// --- Artificial Analysis response ---------------------------------------
// Deliberately loose: only the fields we consume, unknown fields stripped.
// A breaking upstream shape change fails the parse loudly instead of
// producing garbage scaffolds.

export const AaModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  slug: upstreamSlugSchema,
  model_creator: z.object({
    name: z.string().trim().min(1),
    slug: upstreamSlugSchema,
  }),
  release_date: z.string().nullish(),
  context_window_tokens: z.number().int().positive().nullish(),
  licensing: z.object({ is_open_weights: z.boolean().nullish() }).nullish(),
  pricing: z
    .object({
      price_1m_input_tokens: z.number().nullish(),
      price_1m_output_tokens: z.number().nullish(),
    })
    .nullish(),
});

export type AaModel = z.infer<typeof AaModelSchema>;

/** Accepts either a bare array or the documented `{ data: [...] }` envelope. */
export function parseAaModels(input: unknown): AaModel[] {
  if (Array.isArray(input)) {
    return z.array(AaModelSchema).parse(input);
  }

  return z.object({ data: z.array(AaModelSchema) }).parse(input).data;
}

// --- Ledger (data/upstream-seen.json) -----------------------------------
// Tracks every Artificial Analysis model id ever seen, so dismissed models
// never resurface. Never imported by src/ — tooling-only.

export const LedgerEntrySchema = z
  .object({
    aaId: z.string().min(1),
    aaSlug: upstreamSlugSchema,
    aaName: z.string().trim().min(1),
    creator: upstreamSlugSchema,
    status: z.enum(["added", "ignored"]),
    modelId: slugSchema.optional(),
    firstSeen: isoDateSchema,
    note: z.string().optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.status === "added" && entry.modelId === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `"added" entry ${entry.aaSlug} must reference a modelId`,
      });
    }

    if (entry.status === "ignored" && entry.modelId !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `"ignored" entry ${entry.aaSlug} must not reference a modelId`,
      });
    }
  });

export const LedgerFileSchema = z
  .object({
    source: z.httpUrl(),
    entries: z.array(LedgerEntrySchema),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();

    for (const entry of file.entries) {
      if (seen.has(entry.aaId)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate aaId "${entry.aaId}" (${entry.aaSlug})`,
        });
      }

      seen.add(entry.aaId);
    }
  });

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type LedgerFile = z.infer<typeof LedgerFileSchema>;

/**
 * Cross-file rule enforced by validate-data: every "added" ledger entry must
 * point at a model that actually exists. Catches "deleted the scaffold but
 * forgot to flip the ledger row" during PR review.
 */
export function validateLedgerConsistency(
  ledger: LedgerFile,
  models: Model[],
): string[] {
  const modelIds = new Set(models.map((model) => model.id));

  return ledger.entries
    .filter(
      (entry) =>
        entry.status === "added" &&
        entry.modelId !== undefined &&
        !modelIds.has(entry.modelId),
    )
    .map(
      (entry) =>
        `upstream-seen entry "${entry.aaSlug}" is "added" but its modelId "${entry.modelId}" is not in models.json — if the scaffold was rejected, flip this entry to "ignored" and remove its modelId`,
    );
}

// --- Seeding -------------------------------------------------------------

const AA_MODEL_PAGE_PATTERN =
  /^https?:\/\/(?:www\.)?artificialanalysis\.ai\/models\/([A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*)(?:[/#?]|$)/;

/** Extracts the AA model slug from a score's source URL, if it is an AA model page. */
export function extractAaSlug(url: string): string | null {
  const match = AA_MODEL_PAGE_PATTERN.exec(url);

  return match ? match[1] : null;
}

export interface SeedResult {
  ledger: LedgerFile;
  matched: Array<{ modelId: string; aaSlug: string; aaId: string }>;
  backlogCount: number;
  /** Local models whose AA slug could not be recovered or is absent upstream. */
  unmatchedModelIds: string[];
}

/**
 * Builds the initial ledger. Every current model's AA slug is recovered from
 * its score source URLs; matching upstream entries become "added", everything
 * else upstream becomes "ignored" (pre-automation backlog).
 */
export function buildSeedLedger(
  aaModels: AaModel[],
  models: Model[],
  scores: Score[],
  today: string,
): SeedResult {
  const slugByModelId = new Map<string, string>();

  for (const score of scores) {
    const slug = extractAaSlug(score.source.url);

    if (slug !== null && !slugByModelId.has(score.modelId)) {
      slugByModelId.set(score.modelId, slug);
    }
  }

  const modelIdBySlug = new Map<string, string>();

  for (const [modelId, slug] of slugByModelId) {
    const existing = modelIdBySlug.get(slug);

    if (existing !== undefined && existing !== modelId) {
      throw new Error(
        `Seed conflict: models "${existing}" and "${modelId}" both cite the AA slug "${slug}" — resolve before seeding`,
      );
    }

    modelIdBySlug.set(slug, modelId);
  }

  const matched: SeedResult["matched"] = [];
  const entries: LedgerEntry[] = [];
  let backlogCount = 0;

  for (const aaModel of aaModels) {
    const modelId = modelIdBySlug.get(aaModel.slug);

    if (modelId !== undefined) {
      matched.push({ modelId, aaSlug: aaModel.slug, aaId: aaModel.id });
      entries.push({
        aaId: aaModel.id,
        aaSlug: aaModel.slug,
        aaName: aaModel.name,
        creator: aaModel.model_creator.slug,
        status: "added",
        modelId,
        firstSeen: today,
        note: "seed",
      });
    } else {
      backlogCount += 1;
      entries.push({
        aaId: aaModel.id,
        aaSlug: aaModel.slug,
        aaName: aaModel.name,
        creator: aaModel.model_creator.slug,
        status: "ignored",
        firstSeen: today,
        note: `pre-automation backlog (seed ${today})`,
      });
    }
  }

  const upstreamSlugs = new Set(aaModels.map((aaModel) => aaModel.slug));
  const unmatchedModelIds = models
    .filter((model) => {
      const slug = slugByModelId.get(model.id);

      return slug === undefined || !upstreamSlugs.has(slug);
    })
    .map((model) => model.id);

  return {
    ledger: { source: AA_MODELS_ENDPOINT, entries },
    matched,
    backlogCount,
    unmatchedModelIds,
  };
}

// --- Discovery -----------------------------------------------------------

/** Upstream entries whose AA id has never been recorded in the ledger. */
export function diffAgainstLedger(
  aaModels: AaModel[],
  ledger: LedgerFile,
): AaModel[] {
  const seen = new Set(ledger.entries.map((entry) => entry.aaId));

  return aaModels.filter((aaModel) => !seen.has(aaModel.id));
}

/** Removes a trailing parenthetical variant marker, e.g. "gpt-oss 20B (high)". */
export function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

export interface CandidateGroup {
  creator: AaModel["model_creator"];
  baseName: string;
  /** All upstream variants collapsing into this one scaffold. */
  variants: AaModel[];
  /** The variant whose slug/page the scaffold is built from. */
  primary: AaModel;
}

export interface Classification {
  candidates: CandidateGroup[];
  autoIgnored: AaModel[];
}

/**
 * Existing-provider rule: only creators that already have "added" ledger
 * entries produce scaffolds; everything else is recorded but auto-ignored.
 * Variants sharing a creator and base name collapse into one candidate.
 */
export function classifyNew(
  newModels: AaModel[],
  ledger: LedgerFile,
): Classification {
  const trackedCreators = new Set(
    ledger.entries
      .filter((entry) => entry.status === "added")
      .map((entry) => entry.creator),
  );

  const groups = new Map<string, CandidateGroup>();
  const autoIgnored: AaModel[] = [];

  for (const aaModel of newModels) {
    if (!trackedCreators.has(aaModel.model_creator.slug)) {
      autoIgnored.push(aaModel);
      continue;
    }

    const baseName = stripVariantSuffix(aaModel.name);
    const key = `${aaModel.model_creator.slug} ${baseName}`;
    const group = groups.get(key);

    if (group === undefined) {
      groups.set(key, {
        creator: aaModel.model_creator,
        baseName,
        variants: [aaModel],
        primary: aaModel,
      });
    } else {
      group.variants.push(aaModel);
    }
  }

  for (const group of groups.values()) {
    group.primary = pickPrimaryVariant(group);
  }

  return { candidates: [...groups.values()], autoIgnored };
}

function pickPrimaryVariant(group: CandidateGroup): AaModel {
  const exact = group.variants.find(
    (variant) => variant.name.trim() === group.baseName,
  );

  if (exact !== undefined) {
    return exact;
  }

  return [...group.variants].sort(
    (a, b) => a.slug.length - b.slug.length || a.slug.localeCompare(b.slug),
  )[0];
}

// --- Scaffolding ---------------------------------------------------------

/**
 * Derives the local id prefix for a creator from its existing
 * modelId ↔ aaSlug pairs (the repo's prefixes are irregular: "openai-",
 * "alibaba-", "z-ai-", "" for kimi-*, …). Falls back to `<creatorSlug>-`.
 */
export function deriveIdPrefix(creatorSlug: string, ledger: LedgerFile): string {
  const counts = new Map<string, number>();

  for (const entry of ledger.entries) {
    const localAaSlug = toLocalSlug(entry.aaSlug);

    if (
      entry.status !== "added" ||
      entry.creator !== creatorSlug ||
      entry.modelId === undefined ||
      !entry.modelId.endsWith(localAaSlug)
    ) {
      continue;
    }

    const prefix = entry.modelId.slice(0, entry.modelId.length - localAaSlug.length);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  const best = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]),
  )[0];

  return best === undefined ? `${toLocalSlug(creatorSlug)}-` : best[0];
}

/** Converts an opaque upstream slug into a schema-valid local model-id part. */
function toLocalSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized === "") {
    throw new Error(`Cannot derive a local model id from upstream slug "${value}"`);
  }

  return normalized;
}

export interface Scaffold {
  model: Model;
  /** Human-readable review flags rendered in the PR body and dry-run report. */
  flags: string[];
  aaPageUrl: string;
  variants: Array<{ aaId: string; slug: string; name: string }>;
}

export interface ScaffoldResult {
  scaffolds: Scaffold[];
  ledgerRows: LedgerEntry[];
}

const FULL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeReleaseDate(
  raw: string | null | undefined,
  today: string,
): { value: string; flag: string | null } {
  if (typeof raw === "string" && FULL_DATE_PATTERN.test(raw) && isValidCalendarDate(raw)) {
    return { value: raw, flag: null };
  }

  if (typeof raw === "string" && YEAR_MONTH_PATTERN.test(raw)) {
    const candidate = `${raw}-01`;

    if (isValidCalendarDate(candidate)) {
      return {
        value: candidate,
        flag: `releaseDate given as "${raw}" upstream — day defaulted to 01; verify`,
      };
    }
  }

  return {
    value: today,
    flag: "releaseDate unknown upstream — set to the run date; MUST replace with the real release date",
  };
}

/**
 * Builds schema-valid models.json entries plus ledger rows for every new
 * upstream id (scaffolded and auto-ignored alike), so nothing resurfaces.
 */
export function buildScaffolds(
  classification: Classification,
  ledger: LedgerFile,
  models: Model[],
  today: string,
): ScaffoldResult {
  const takenIds = new Set(models.map((model) => model.id));
  const labByCreator = buildLabByCreator(ledger, models);
  const ledgerBySlug = new Map(
    ledger.entries.map((entry) => [entry.aaSlug, entry]),
  );

  const scaffolds: Scaffold[] = [];
  const ledgerRows: LedgerEntry[] = [];

  for (const group of classification.candidates) {
    const flags: string[] = [
      "url is the AA page placeholder — MUST replace with the official vendor announcement/model card (CI stays red until done)",
    ];

    const prefix = deriveIdPrefix(group.creator.slug, ledger);
    const primaryIdSlug = toLocalSlug(group.primary.slug);
    let id = primaryIdSlug.startsWith(prefix)
      ? primaryIdSlug
      : `${prefix}${primaryIdSlug}`;

    if (takenIds.has(id)) {
      let suffix = 2;

      while (takenIds.has(`${id}-${suffix}`)) {
        suffix += 1;
      }

      id = `${id}-${suffix}`;
      flags.push(`id collided with an existing id — suffixed "-${suffix}"; MUST rename`);
    }

    takenIds.add(id);

    const lab = labByCreator.get(group.creator.slug);

    if (lab === undefined) {
      flags.push(
        `lab could not be resolved from existing models — defaulted to upstream creator name "${group.creator.name}"; verify`,
      );
    }

    const releaseDate = normalizeReleaseDate(group.primary.release_date, today);

    if (releaseDate.flag !== null) {
      flags.push(releaseDate.flag);
    }

    const openWeights = group.primary.licensing?.is_open_weights;

    if (openWeights === null || openWeights === undefined) {
      flags.push("openWeights unknown upstream — defaulted to false; verify");
    }

    const contextWindow = group.primary.context_window_tokens;

    if (contextWindow === null || contextWindow === undefined) {
      flags.push("contextWindow unknown upstream — omitted; add if published");
    }

    const pricing = normalizePricing(group.primary.pricing, flags);

    for (const variant of group.variants) {
      const previous = ledgerBySlug.get(variant.slug);

      if (previous !== undefined) {
        flags.push(
          `upstream slug "${variant.slug}" was previously recorded as "${previous.status}" under a different AA id — possible upstream re-issue; if it is the same model, reject this scaffold and keep the original entry`,
        );
      }
    }

    const aaPageUrl = `https://artificialanalysis.ai/models/${group.primary.slug}`;

    const model = ModelSchema.parse({
      id,
      name: group.baseName,
      lab: lab ?? group.creator.name,
      releaseDate: releaseDate.value,
      openWeights: openWeights ?? false,
      ...(contextWindow !== null && contextWindow !== undefined
        ? { contextWindow }
        : {}),
      ...(pricing !== null ? { pricing } : {}),
      url: aaPageUrl,
    });

    scaffolds.push({
      model,
      flags,
      aaPageUrl,
      variants: group.variants.map((variant) => ({
        aaId: variant.id,
        slug: variant.slug,
        name: variant.name,
      })),
    });

    for (const variant of group.variants) {
      ledgerRows.push({
        aaId: variant.id,
        aaSlug: variant.slug,
        aaName: variant.name,
        creator: group.creator.slug,
        status: "added",
        modelId: id,
        firstSeen: today,
        note: "scaffolded (auto)",
      });
    }
  }

  for (const aaModel of classification.autoIgnored) {
    ledgerRows.push({
      aaId: aaModel.id,
      aaSlug: aaModel.slug,
      aaName: aaModel.name,
      creator: aaModel.model_creator.slug,
      status: "ignored",
      firstSeen: today,
      note: "provider not tracked (auto)",
    });
  }

  return { scaffolds, ledgerRows };
}

function buildLabByCreator(
  ledger: LedgerFile,
  models: Model[],
): Map<string, string> {
  const labById = new Map(models.map((model) => [model.id, model.lab]));
  const labByCreator = new Map<string, string>();

  for (const entry of ledger.entries) {
    if (entry.status !== "added" || entry.modelId === undefined) {
      continue;
    }

    const lab = labById.get(entry.modelId);

    if (lab !== undefined && !labByCreator.has(entry.creator)) {
      labByCreator.set(entry.creator, lab);
    }
  }

  return labByCreator;
}

function normalizePricing(
  pricing: AaModel["pricing"],
  flags: string[],
): Model["pricing"] | null {
  const input = pricing?.price_1m_input_tokens;
  const output = pricing?.price_1m_output_tokens;

  if (
    input === null ||
    input === undefined ||
    output === null ||
    output === undefined
  ) {
    flags.push("pricing unknown upstream — omitted; verify vendor pricing");

    return null;
  }

  if (input === 0 && output === 0) {
    flags.push(
      "pricing reported as $0/$0 upstream (likely a free-period artifact) — omitted; verify vendor pricing",
    );

    return null;
  }

  if (input < 0 || output < 0) {
    flags.push("pricing reported as negative upstream — omitted; verify vendor pricing");

    return null;
  }

  return { input, output };
}

// --- Rendering -----------------------------------------------------------

export function renderPrTitle(result: ScaffoldResult, today: string): string {
  const scaffoldCount = result.scaffolds.length;
  const totalCount = countNewIds(result);

  if (scaffoldCount > 0) {
    return `data: scaffold ${scaffoldCount} upstream model${
      scaffoldCount === 1 ? "" : "s"
    } — needs curation (${today})`;
  }

  return `data: record ${totalCount} new upstream model${
    totalCount === 1 ? "" : "s"
  } — none scaffolded (${today})`;
}

export function countNewIds(result: ScaffoldResult): number {
  return result.ledgerRows.length;
}

export function renderPrBody(
  result: ScaffoldResult,
  classification: Classification,
  benchmarks: Benchmark[],
  today: string,
): string {
  const lines: string[] = [
    "> Model metadata discovered via the free [Artificial Analysis](https://artificialanalysis.ai/) API.",
    "> Benchmark scores are **never** auto-added — curate them manually per the checklist below.",
    "",
  ];

  if (result.scaffolds.length > 0) {
    lines.push(`## Scaffolded models (${result.scaffolds.length})`, "");
    lines.push("| Model | Creator | AA page | Variants seen |");
    lines.push("| --- | --- | --- | --- |");

    for (const scaffold of result.scaffolds) {
      const variants = scaffold.variants
        .map((variant) => `\`${variant.slug}\``)
        .join(", ");

      lines.push(
        `| **${scaffold.model.name}** (\`${scaffold.model.id}\`) | ${scaffold.model.lab} | [${scaffold.aaPageUrl.split("/models/")[1]}](${scaffold.aaPageUrl}) | ${variants} |`,
      );
    }

    lines.push("", "## Curation checklist", "");

    for (const scaffold of result.scaffolds) {
      lines.push(`### ${scaffold.model.name} (\`${scaffold.model.id}\`)`, "");
      lines.push("Metadata:", "");

      for (const flag of scaffold.flags) {
        lines.push(`- [ ] ${flag}`);
      }

      lines.push(
        "- [ ] Confirm official `name` casing and the `id` slug (rename freely — nothing references it yet)",
        "- [ ] Verify `releaseDate`, `openWeights`, `contextWindow`, and `pricing` against the vendor page",
      );

      if (scaffold.variants.length > 1) {
        const variants = scaffold.variants
          .map((variant) => `\`${variant.slug}\` (${variant.name})`)
          .join(", ");

        lines.push(
          `- [ ] Multiple upstream variants collapsed into this scaffold: ${variants} — score the evaluated variant and set \`reasoningEffort\` accordingly`,
        );
      }

      lines.push(
        "",
        `Scores — curate from the [AA intelligence breakdown](${scaffold.aaPageUrl}#intelligence-breakdown) and cross-check the official vendor page. One record per model/benchmark pair; \`source.url\` + ISO \`retrieved\`; \`settings\` when published; truthful \`selfReported\`; consistent per-model \`reasoningEffort\`; omit missing scores — never 0:`,
        "",
      );

      for (const benchmark of benchmarks) {
        lines.push(`- [ ] \`${benchmark.id}\``);
      }

      lines.push("");
    }
  }

  if (classification.autoIgnored.length > 0) {
    lines.push(
      `## Seen upstream, not scaffolded (${classification.autoIgnored.length})`,
      "",
      "Recorded in the ledger as `ignored` (provider not tracked). To promote one: add a `models.json` entry by hand and flip its ledger row to `added` with the `modelId`.",
      "",
      "| AA model | Creator | Slug |",
      "| --- | --- | --- |",
    );

    for (const aaModel of classification.autoIgnored) {
      lines.push(
        `| ${aaModel.name} | ${aaModel.model_creator.name} | [\`${aaModel.slug}\`](https://artificialanalysis.ai/models/${aaModel.slug}) |`,
      );
    }

    lines.push("");
  }

  lines.push(
    "## Reviewer protocol",
    "",
    "- To **reject** a scaffold: delete its `models.json` entry **and** flip its ledger row(s) in `data/upstream-seen.json` to `ignored` (remove the `modelId`). CI enforces consistency.",
    "- Commit scores to this branch before marking the PR ready.",
    "- Bump the README snapshot counts and add a `PLAN.md` decision-log line.",
    "- CI stays red until every placeholder `url` is replaced with an official vendor page.",
    "",
    `_Generated ${today} by the scheduled discovery workflow._`,
  );

  return lines.join("\n");
}

export function renderDryRunReport(
  result: ScaffoldResult,
  classification: Classification,
): string {
  const lines: string[] = [];

  if (result.scaffolds.length === 0 && classification.autoIgnored.length === 0) {
    return "No new upstream models.";
  }

  lines.push(
    `${countNewIds(result)} new upstream id(s): ${result.scaffolds.length} scaffold(s), ${classification.autoIgnored.length} auto-ignored.`,
    "",
  );

  for (const scaffold of result.scaffolds) {
    lines.push(`SCAFFOLD ${scaffold.model.id} (${scaffold.model.lab})`);
    lines.push(`  ${JSON.stringify(scaffold.model)}`);

    for (const flag of scaffold.flags) {
      lines.push(`  ! ${flag}`);
    }
  }

  for (const aaModel of classification.autoIgnored) {
    lines.push(
      `IGNORE ${aaModel.slug} (${aaModel.model_creator.name}) — provider not tracked`,
    );
  }

  return lines.join("\n");
}

export function renderSeedReport(seed: SeedResult): string {
  const lines: string[] = [
    `Matched ${seed.matched.length} existing model(s) to upstream entries; ${seed.backlogCount} upstream entr${
      seed.backlogCount === 1 ? "y" : "ies"
    } marked as pre-automation backlog.`,
  ];

  if (seed.unmatchedModelIds.length > 0) {
    lines.push(
      "",
      `${seed.unmatchedModelIds.length} local model(s) have no live upstream entry (delisted or renamed upstream — informational only):`,
    );

    for (const modelId of seed.unmatchedModelIds) {
      lines.push(`  - ${modelId}`);
    }
  }

  return lines.join("\n");
}
