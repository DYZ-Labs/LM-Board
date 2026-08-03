import { describe, expect, it } from "vitest";

import {
  distributionFor,
  efficientFrontier,
  expandPlotPayload,
  normalizeToRange,
  toPlotPayload,
  toPlotRows,
} from "@/lib/visualization";
import { loadLeaderboardData } from "@/lib/data";

const point = (id: string, price: number, index: number) => ({
  id,
  item: id,
  price,
  index,
});

describe("efficientFrontier", () => {
  it("keeps only the best model at an identical price", () => {
    expect([
      ...efficientFrontier([point("low", 2, 50), point("high", 2, 60)]),
    ]).toEqual(["high"]);
  });

  it("preserves exact price and Index ties", () => {
    expect(
      [
        ...efficientFrontier([
          point("a", 0, 60),
          point("b", 0, 60),
          point("c", 1, 59),
        ]),
      ].sort(),
    ).toEqual(["a", "b"]);
  });

  it("treats a same-index cheaper model as dominant", () => {
    expect([
      ...efficientFrontier([point("cheap", 1, 60), point("dear", 2, 60)]),
    ]).toEqual(["cheap"]);
  });

  it("keeps free models at their real zero price", () => {
    expect([
      ...efficientFrontier([point("free", 0, 40), point("paid", 1, 50)]),
    ]).toEqual(["free", "paid"]);
  });
});

describe("distributionFor", () => {
  it("returns quartiles and a tie-stable midrank percentile", () => {
    expect(distributionFor([10, 20, 20, 40], 20)).toEqual({
      min: 10,
      q1: 17.5,
      median: 20,
      q3: 25,
      max: 40,
      percentile: 50,
    });
  });
});

describe("normalizeToRange", () => {
  it("clamps to a stable zero-to-one range", () => {
    expect(normalizeToRange(-1, 0, 10)).toBe(0);
    expect(normalizeToRange(5, 0, 10)).toBe(0.5);
    expect(normalizeToRange(11, 0, 10)).toBe(1);
  });
});

describe("toPlotRows", () => {
  it("keeps the /value client payload free of scores, sources and ramps", () => {
    const [row] = toPlotRows(loadLeaderboardData().rows);

    expect(Object.keys(row).sort()).toEqual(["model", "scopes"]);
    expect(Object.keys(row.model).sort()).toEqual([
      "id",
      "lab",
      "name",
      "openWeights",
      "pricing",
    ]);
    expect(JSON.stringify(row)).not.toContain("scoresByBenchmark");
    expect(JSON.stringify(row)).not.toContain("source");
    expect(JSON.stringify(row)).not.toContain("rampByBenchmark");
  });

  it("serializes only the selected scope for the stand-alone value route", () => {
    const data = loadLeaderboardData();
    const legacyRows = toPlotRows(data.rows);
    const payload = toPlotPayload(data.rows, "overall");
    const expanded = expandPlotPayload(payload);

    expect(payload.every((row) => row.length === 9)).toBe(true);
    expect(expanded).toEqual(
      data.rows.map((row) => ({
        model: {
          id: row.model.id,
          name: row.model.name,
          lab: row.model.lab,
          openWeights: row.model.openWeights,
          ...(row.model.pricing === undefined
            ? {}
            : {
                pricing: {
                  input: row.model.pricing.input,
                  output: row.model.pricing.output,
                },
              }),
        },
        scope: {
          index: row.scopes.overall.index,
          rank: row.scopes.overall.rank,
          rankedFieldSize: row.scopes.overall.rankedFieldSize,
        },
      })),
    );
    expect(JSON.stringify(payload).length).toBeLessThan(
      JSON.stringify(legacyRows).length * 0.2,
    );
  });
});
