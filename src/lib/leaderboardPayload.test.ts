import { describe, expect, it } from "vitest";

import { loadLeaderboardData } from "@/lib/data";
import {
  expandLeaderboardClientPayload,
  toLeaderboardClientPayload,
} from "@/lib/leaderboardPayload";

describe("production leaderboard payload", () => {
  it("compresses repeated Artificial Analysis URL structure losslessly", () => {
    const data = loadLeaderboardData();
    const payload = toLeaderboardClientPayload(data);
    const expanded = expandLeaderboardClientPayload(payload);

    expect(
      payload.sourceRefs.some((reference) => reference.startsWith("@")),
    ).toBe(true);
    expect(
      expanded.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row.scoresByBenchmark).map(([id, score]) => [
            id,
            score?.source.url ?? null,
          ]),
        ),
      ),
    ).toEqual(
      data.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row.scoresByBenchmark).map(([id, score]) => [
            id,
            score?.source.url ?? null,
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
