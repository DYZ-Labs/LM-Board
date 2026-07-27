import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadLeaderboardData } from "../../src/lib/data";
import type { LeaderboardRow } from "../../src/lib/data";
import type { Benchmark } from "../../src/lib/schema";
import {
  RAILS,
  assertCoverage,
  contextLabel,
  fitName,
  modelAlt,
  modelCard,
  retrievedRange,
  siteCard,
  tiedRanks,
} from "./cards";
import { covers, FACE_KEYS } from "./fonts";
import { audit } from "./render";
import { CARD_COLOURS, TOKEN_SOURCES } from "./tokens";
import {
  ellipsise,
  fitLines,
  hardWrapRaw,
  measure,
  uncovered,
  wrapRaw,
} from "./type";

const data = loadLeaderboardData();
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("the typesetter", () => {
  it("keeps the word space when it truncates", () => {
    // The prototype rtrimmed each wrapped line and rejoined the overflow with
    // "", shipping a benchmark called "Multilingual InstructionFollo…".
    const label = "Multilingual Instruction Following Robustness";
    const raw = wrapRaw("archivo400", 15, label, 0, 118.25, 999);

    expect(raw?.join("")).toBe(label);

    const fit = fitLines("archivo400", [15], [15], label, 0, 118.25, 2);

    expect(fit.truncated).toBe(true);
    expect(fit.lines[1]).toMatch(/^Instruction /);
    expect(fit.lines.join(" ")).not.toMatch(/[a-z][A-Z]/);
  });

  it("does not weld across a hyphen either", () => {
    const raw = hardWrapRaw("archivo400", 15, "Terminal-Bench v2.1", 0, 40);

    expect(raw.join("")).toBe("Terminal-Bench v2.1");
  });

  it("breaks inside a token that is wider than the column", () => {
    // `wrap` returns null here, and the prototype's fallback then emitted the
    // whole 288px string as line 0 in a 118px column.
    const token = "MultilingualInstructionFollowingRobustness";

    expect(wrapRaw("archivo400", 15, token, 0, 118.25, 999)).toBeNull();

    const lines = hardWrapRaw("archivo400", 15, token, 0, 118.25);

    expect(lines.join("")).toBe(token);
    for (const line of lines) {
      expect(measure("archivo400", 15, line, 0).width).toBeLessThanOrEqual(118.25);
    }
  });

  it("never returns a line wider than the box, at any size on the ladder", () => {
    for (const name of [
      ...data.rows.map((row) => row.model.name),
      "MultilingualInstructionFollowingRobustnessEvaluationHarness",
      "o3",
    ]) {
      const fit = fitName(name);

      for (const line of fit.lines) {
        expect(
          measure("archivo580", fit.size, line, -0.028 * fit.size).width,
        ).toBeLessThanOrEqual(688);
      }
    }
  });

  it("sizes by measured width, not by character count", () => {
    // "Claude Sonnet 4.5" is two characters longer than "Claude Sonnet 5" and
    // was set two ladder steps smaller for it.
    expect(fitName("Claude Sonnet 4.5").size).toBe(fitName("Claude Sonnet 5").size);
  });

  it("ellipsises to fit rather than to a character count", () => {
    const clipped = ellipsise("archivo580", 17, "A".repeat(200), 2, 300);

    expect(measure("archivo580", 17, clipped, 2).width).toBeLessThanOrEqual(300);
    expect(clipped.endsWith("…")).toBe(true);
  });
});

describe("glyph coverage", () => {
  it("reads the real cmap, so a glyph no shipped face has is not 'covered'", () => {
    // τ is in a live benchmark name and is in neither Archivo nor Geist Mono.
    // The prototype measured glyphs in Chromium, where a system face silently
    // supplied it, so the guard built to catch exactly this could not see it.
    expect(covers("archivo400", "τ")).toBe(false);
    expect(covers("mono500", "τ")).toBe(false);
    expect(covers("fallback", "τ")).toBe(true);
    expect(uncovered("archivo400", "τ³-Banking")).toEqual([]);
  });

  it("covers every character in the live corpus", () => {
    const strings = [
      ...data.rows.flatMap((row) => [row.model.name, row.model.lab]),
      ...data.benchmarks.map((benchmark) => benchmark.name),
    ];

    for (const value of strings) {
      expect(uncovered("archivo580", value)).toEqual([]);
      expect(uncovered("archivo400", value)).toEqual([]);
    }
  });

  it("fails the build rather than shipping 62 cards missing a lab name", () => {
    expect(() =>
      assertCoverage([
        { faceKey: "archivo580", text: "腾讯 Hunyuan", where: "test lab" },
      ]),
    ).toThrow(/U\+817E/);
  });

  it("routes an uncovered glyph to the face that draws it", () => {
    const runs = measure("archivo400", 15, "τ³-Banking", 0).runs;

    expect(runs.map((run) => run.faceKey)).toEqual(["fallback", "archivo400"]);
    expect(runs.map((run) => run.text).join("")).toBe("τ³-Banking");
  });
});

describe("the palette", () => {
  it("still matches the dark values in tokens.css", () => {
    const css = readFileSync(join(root, "src/styles/tokens.css"), "utf8");

    for (const [key, token] of Object.entries(TOKEN_SOURCES)) {
      const light = new RegExp(
        `${token}:\\s*light-dark\\([^,]+,\\s*(#[0-9a-f]{6})\\s*\\)`,
      ).exec(css);

      expect(light, `${token} not found in tokens.css`).not.toBeNull();
      expect(light![1]).toBe(CARD_COLOURS[key as keyof typeof CARD_COLOURS]);
    }
  });
});

describe("derived data", () => {
  it("derives the tie flag rather than declaring one that never fires", () => {
    // Standard competition ranking produces shared ranks by design: Math has
    // them today. The prototype read a `tied` field nothing ever wrote.
    expect(tiedRanks(data.rows, "math").size).toBeGreaterThan(0);
    expect(tiedRanks(data.rows, "overall").size).toBe(0);
  });

  it("prints the exact context window, never a 1024-based abbreviation", () => {
    expect(contextLabel(200_000)).toBe("200,000 context");
    expect(contextLabel(1_048_576)).toBe("1,048,576 context");
    expect(contextLabel(undefined)).toBeNull();
  });

  it("keeps the year on a retrieval range that crosses one", () => {
    const row = data.rows[0];
    const across = {
      ...row,
      scoresByBenchmark: {
        a: { ...row.scoresByBenchmark[data.benchmarks[0].id]!, source: { url: "https://x.test", retrieved: "2025-12-28" } },
        b: { ...row.scoresByBenchmark[data.benchmarks[0].id]!, source: { url: "https://x.test", retrieved: "2026-01-03" } },
      },
    } as unknown as LeaderboardRow;

    expect(retrievedRange(across)).toBe("Dec 28, 2025 – Jan 3, 2026");
  });

  it("names the scope it is actually reporting", () => {
    const row = data.rows[0];

    expect(modelAlt(row, "math", false)).toContain("Math Index");
    expect(modelAlt(row, "overall", true)).toContain("tied at");
  });

  it("separates score publication from LM Board freshness language", () => {
    const serialized = JSON.stringify(siteCard(data).nodes);

    expect(serialized).toContain("Scores published by ");
    expect(serialized).toContain("Artificial Analysis");
    expect(serialized).toContain("Newest retrieval ");
    expect(serialized).not.toContain("Measured by ");
    expect(serialized).not.toContain("Updated ");
  });

  it("qualifies vendor-reported scores on a model card", () => {
    const row = data.rows[0];
    const firstBenchmark = data.benchmarks[0];
    const score = row.scoresByBenchmark[firstBenchmark.id]!;
    const mixed: LeaderboardRow = {
      ...row,
      scoresByBenchmark: {
        ...row.scoresByBenchmark,
        [firstBenchmark.id]: { ...score, selfReported: true },
      },
    };
    const serialized = JSON.stringify(modelCard(mixed, data).nodes);

    expect(serialized).toContain("vendor-reported");
  });
});

describe("the card geometry", () => {
  it("passes its own gutter, frame and overlap audit on every record", () => {
    for (const row of data.rows) {
      expect(audit(modelCard(row, data))).toEqual([]);
    }

    expect(audit(siteCard(data))).toEqual([]);
  });

  it("holds the readout column at every benchmark count up to fourteen", () => {
    const row = data.rows[0];

    for (let n = 1; n <= 14; n += 1) {
      const benchmarks: Benchmark[] = Array.from({ length: n }, (_, i) => ({
        ...data.benchmarks[i % data.benchmarks.length],
        id: `synthetic-${i}`,
      }));
      const wide: LeaderboardRow = {
        ...row,
        scopes: {
          ...row.scopes,
          overall: { ...row.scopes.overall, coverageCount: n - 1, coverageTotal: n },
        },
      };

      // The coverage line's width is a function of the same count that derives
      // the columns; at eleven of twelve it overflowed the gutter at 18px and
      // failed the build rather than degrading.
      expect(audit(modelCard(wide, data, { benchmarks }))).toEqual([]);
    }
  });

  it("draws a track for a measured zero and nothing at all for a missing value", () => {
    const row = data.rows[0];
    const zeroed: LeaderboardRow = {
      ...row,
      scoresByBenchmark: {
        ...row.scoresByBenchmark,
        [data.benchmarks[0].id]: {
          ...row.scoresByBenchmark[data.benchmarks[0].id]!,
          value: 0,
        },
        [data.benchmarks[1].id]: null,
      },
    };
    const tracks = modelCard(zeroed, data).nodes.filter(
      (node) =>
        node.props.style.top === `${RAILS.trackTop.toFixed(2)}px` &&
        node.props.style.left === `${RAILS.gutterLeft.toFixed(2)}px`,
    );

    // Column 0 measured 0.0: one track, no fill. Column 1 missing: neither.
    expect(tracks).toHaveLength(1);
    expect(tracks[0].props.style.backgroundColor).toBe(CARD_COLOURS.bgRaised);
  });

  it("drives the bar from the displayed value, so a 0.04 that prints 0.0 draws none", () => {
    const row = data.rows[0];
    const tiny: LeaderboardRow = {
      ...row,
      scoresByBenchmark: {
        ...row.scoresByBenchmark,
        [data.benchmarks[0].id]: {
          ...row.scoresByBenchmark[data.benchmarks[0].id]!,
          value: 0.04,
        },
      },
    };
    const atColumnZero = modelCard(tiny, data).nodes.filter(
      (node) =>
        node.props.style.top === `${RAILS.trackTop.toFixed(2)}px` &&
        node.props.style.left === `${RAILS.gutterLeft.toFixed(2)}px`,
    );

    expect(atColumnZero).toHaveLength(1);
  });

  it("never positions anything with `inset`, which satori ignores", () => {
    const serialized = JSON.stringify([
      modelCard(data.rows[0], data).nodes,
      siteCard(data).nodes,
    ]);

    expect(serialized).not.toContain("inset");
    expect(serialized).not.toContain("grid");
    expect(serialized).not.toContain("lineClamp");
    expect(serialized).not.toContain("textOverflow");
    expect(serialized).not.toContain("textTransform");
  });

  it("carries no literal count — every number comes off the dataset", () => {
    const strings = JSON.stringify(siteCard(data).nodes);

    expect(strings).toContain(`"${data.rows.length}"`);
    expect(strings).toContain(`"${data.scoreCount}"`);
    expect(siteCard(data).alt).toContain(`${data.rows.length} frontier models`);
  });

  it("ships one font file per declared face and nothing unresolvable", () => {
    for (const key of FACE_KEYS) {
      expect(covers(key, key === "fallback" ? "τ" : "A")).toBe(true);
    }
  });
});
