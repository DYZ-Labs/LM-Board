/**
 * One registry owns every benchmark scope exposed by the schema, ranking,
 * URL state, tabs, and methodology. Adding a category here makes omissions in
 * those consumers visible to TypeScript and the contract test.
 */
export const RANK_SCOPE_OPTIONS = [
  { value: "overall", label: "Overall", benchmarkCategory: false },
  { value: "reasoning", label: "Reasoning", benchmarkCategory: true },
  { value: "coding", label: "Coding", benchmarkCategory: true },
  { value: "math", label: "Math", benchmarkCategory: true },
  { value: "agentic", label: "Agentic", benchmarkCategory: true },
] as const;

export type RankScope = (typeof RANK_SCOPE_OPTIONS)[number]["value"];
export type BenchmarkCategory = Exclude<RankScope, "overall">;

export const RANK_SCOPES: readonly RankScope[] = RANK_SCOPE_OPTIONS.map(
  ({ value }) => value,
);

export const BENCHMARK_CATEGORIES = RANK_SCOPE_OPTIONS.filter(
  (option) => option.benchmarkCategory,
).map(({ value }) => value) as [
  BenchmarkCategory,
  ...BenchmarkCategory[],
];

export function rankScopeLabel(scope: RankScope): string {
  return RANK_SCOPE_OPTIONS.find((option) => option.value === scope)!.label;
}
