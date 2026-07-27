import { describe, expect, it } from "vitest";

import { loadLeaderboardData } from "@/lib/data";
import {
  expandLeaderboardClientPayload,
  toLeaderboardClientPayload,
} from "@/lib/leaderboardPayload";

describe("production leaderboard payload", () => {
  it("keeps record-only evidence out while preserving visible score data", () => {
    const data = loadLeaderboardData();
    const payload = toLeaderboardClientPayload(data);
    const expanded = expandLeaderboardClientPayload(payload);
    const serialized = JSON.stringify(payload);

    expect(payload).not.toHaveProperty("sourceRefs");
    expect(payload).not.toHaveProperty("retrievedDates");
    expect(payload).not.toHaveProperty("settings");
    expect(serialized).not.toContain("artificialanalysis.ai/models/");
    expect(
      expanded.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row.scoresByBenchmark).map(([id, score]) => [
            id,
            score
              ? [score.value, score.selfReported]
              : null,
          ]),
        ),
      ),
    ).toEqual(
      data.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row.scoresByBenchmark).map(([id, score]) => [
            id,
            score
              ? [score.value, score.selfReported]
              : null,
          ]),
        ),
      ),
    );
  });

  it("deduplicates labs and expands compact model tuples losslessly", () => {
    const data = loadLeaderboardData();
    const payload = toLeaderboardClientPayload(data);
    const expanded = expandLeaderboardClientPayload(payload);
    const modelPayloads = payload.rows.map(([model]) => model);

    expect(modelPayloads.every((model) => model.length === 9)).toBe(true);
    expect(expanded.rows.map((row) => row.model)).toEqual(
      data.rows.map((row) => row.model),
    );
    expect(JSON.stringify(modelPayloads).length).toBeLessThan(
      JSON.stringify(data.rows.map((row) => row.model)).length * 0.65,
    );
  });
});
