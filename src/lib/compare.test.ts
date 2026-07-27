import { describe, expect, it } from "vitest";

import {
  expandComparePayload,
  toCompareData,
  toComparePayload,
} from "@/lib/compare";
import { loadLeaderboardData } from "@/lib/data";

describe("compare payload", () => {
  it("round-trips the complete compare projection", () => {
    const data = loadLeaderboardData();

    expect(expandComparePayload(toComparePayload(data))).toEqual(
      toCompareData(data),
    );
  });

  it("normalizes repeated citation fields before the client boundary", () => {
    const payload = toComparePayload(loadLeaderboardData());
    const serialized = JSON.stringify(payload);
    const expanded = JSON.stringify(
      toCompareData(loadLeaderboardData()),
    );

    expect(payload.sourceRefs.length).toBeLessThan(
      loadLeaderboardData().scoreCount,
    );
    expect(serialized.length).toBeLessThan(expanded.length * 0.45);
    expect(serialized).not.toContain("scoresByBenchmark");
    expect(serialized).not.toContain("sourceUrl");
    expect(serialized).not.toContain('"retrieved":');
  });
});
