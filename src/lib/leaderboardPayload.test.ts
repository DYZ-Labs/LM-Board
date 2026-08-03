import { afterEach, describe, expect, it, vi } from "vitest";

import { loadLeaderboardData } from "@/lib/data";
import {
  expandLeaderboardClientPayload,
  toLeaderboardClientPayload,
} from "@/lib/leaderboardPayload";

const UPSTREAM_PLACEHOLDER_FLAG = "VALIDATE_ALLOW_UPSTREAM_PLACEHOLDERS";

function allowsUpstreamPlaceholders() {
  return process.env[UPSTREAM_PLACEHOLDER_FLAG] === "1";
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production leaderboard payload", () => {
  it("keeps record-only evidence out while preserving visible score data", () => {
    const data = loadLeaderboardData();
    const payload = toLeaderboardClientPayload(data);
    const expanded = expandLeaderboardClientPayload(payload);
    const serialized = JSON.stringify(payload);

    expect(payload).not.toHaveProperty("sourceRefs");
    expect(payload).not.toHaveProperty("retrievedDates");
    expect(payload).not.toHaveProperty("settings");
    // Discovery runs the full suite after appending uncurated models whose
    // temporary AA URLs intentionally keep the eventual PR red. Its explicit
    // validation exception applies only to that scaffold run; ordinary CI
    // continues proving those URLs can never ship in the client payload.
    if (!allowsUpstreamPlaceholders()) {
      expect(serialized).not.toContain("artificialanalysis.ai/models/");
    }
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

describe("discovery scaffold validation", () => {
  it("allows temporary upstream URLs only under the explicit workflow flag", () => {
    vi.stubEnv(UPSTREAM_PLACEHOLDER_FLAG, "0");
    expect(allowsUpstreamPlaceholders()).toBe(false);

    vi.stubEnv(UPSTREAM_PLACEHOLDER_FLAG, "1");
    expect(allowsUpstreamPlaceholders()).toBe(true);

    vi.stubEnv(UPSTREAM_PLACEHOLDER_FLAG, "true");
    expect(allowsUpstreamPlaceholders()).toBe(false);
  });
});
