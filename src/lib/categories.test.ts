import { describe, expect, it } from "vitest";

import {
  BENCHMARK_CATEGORIES,
  RANK_SCOPES,
  RANK_SCOPE_OPTIONS,
  rankScopeLabel,
} from "./categories";

describe("category registry", () => {
  it("derives benchmark categories, rank scopes, and labels from one registry", () => {
    expect(RANK_SCOPES).toEqual(
      RANK_SCOPE_OPTIONS.map(({ value }) => value),
    );
    expect(BENCHMARK_CATEGORIES).toEqual(
      RANK_SCOPE_OPTIONS.filter(
        ({ benchmarkCategory }) => benchmarkCategory,
      ).map(({ value }) => value),
    );

    for (const option of RANK_SCOPE_OPTIONS) {
      expect(rankScopeLabel(option.value)).toBe(option.label);
    }
  });
});
