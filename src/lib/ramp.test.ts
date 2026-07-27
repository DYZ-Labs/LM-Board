import { describe, expect, it } from "vitest";

import { loadLeaderboardData } from "./data";
import { MIN_FILL, rampFill } from "./ramp";

const gpqa = { min: 58.7, max: 94.1 };

describe("rampFill", () => {
  it("fills the track at the top of the benchmark's field", () => {
    expect(rampFill(gpqa.max, gpqa)).toBe(1);
  });

  it("keeps the weakest result visible rather than collapsing it", () => {
    // A zero-height mark and a missing score would be the same picture, and
    // this product may never blur those two.
    expect(rampFill(gpqa.min, gpqa)).toBe(MIN_FILL);
  });

  it("places a value by its position in the field, not on 0-100", () => {
    const midpoint = (gpqa.min + gpqa.max) / 2;

    expect(rampFill(midpoint, gpqa)).toBeCloseTo(0.5, 10);
    // The same score against a harder benchmark's field draws differently.
    expect(rampFill(midpoint, { min: 0, max: 100 })).toBeCloseTo(0.764, 3);
  });

  it("clamps to the field rather than extrapolating past it", () => {
    expect(rampFill(120, gpqa)).toBe(1);
    expect(rampFill(0, gpqa)).toBe(MIN_FILL);
  });

  it("draws a full mark for a degenerate or absent domain", () => {
    // One measured score in a benchmark is a field of one; it is both the best
    // and the worst result, so anything but a full mark would be a claim.
    expect(rampFill(42, { min: 42, max: 42 })).toBe(1);
    expect(rampFill(42, undefined)).toBe(1);
  });

  it("separates models more than it separates benchmarks on real data", () => {
    // Against 0-100 the mark drew the benchmark suite's difficulty and redrew
    // it identically for every model: between-benchmark spread was 2.3x
    // between-model spread. The bar is supposed to be about the model.
    const data = loadLeaderboardData();
    const ids = data.benchmarks.map((benchmark) => benchmark.id);
    const complete = data.rows.filter((row) =>
      ids.every((id) => row.scoresByBenchmark[id]),
    );

    const sd = (values: number[]) => {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      return Math.sqrt(
        values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
      );
    };
    const spreads = (fill: (value: number, id: string) => number) => {
      const grid = complete.map((row) =>
        ids.map((id) => fill(row.scoresByBenchmark[id]!.value, id)),
      );
      const perBenchmark = ids.map(
        (_, column) =>
          grid.reduce((sum, row) => sum + row[column]!, 0) / grid.length,
      );
      const perModel = grid.map(
        (row) => row.reduce((sum, v) => sum + v, 0) / row.length,
      );
      return sd(perBenchmark) / sd(perModel);
    };

    const absolute = spreads((value) => Math.min(1, Math.max(0, value / 100)));
    const normalised = spreads((value, id) =>
      rampFill(value, data.benchmarkDomains[id]),
    );

    expect(absolute).toBeGreaterThan(1);
    expect(normalised).toBeLessThan(1);
    expect(normalised).toBeLessThan(absolute / 2);
  });
});
