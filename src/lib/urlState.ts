import type { Category } from "@/components/CategoryTabs";
import type { LeaderboardRow } from "@/lib/data";
import type { Benchmark } from "@/lib/schema";
import {
  DEFAULT_SORT,
  defaultDirectionFor,
  type SortColumn,
  type SortDirection,
  type SortState,
} from "@/lib/useSort";

const categories = new Set<Category>([
  "overall",
  "reasoning",
  "coding",
  "math",
  "agentic",
]);

export function modelFragment(name: string) {
  return name
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function categoryFromUrl(value: string | null): Category {
  return value && categories.has(value as Category)
    ? (value as Category)
    : "overall";
}

function columnFromKey(
  key: string | null,
  benchmarks: readonly Benchmark[],
): SortColumn | null {
  if (
    key === "rank" ||
    key === "model" ||
    key === "index" ||
    key === "price"
  ) {
    return { kind: key };
  }

  return benchmarks.some((benchmark) => benchmark.id === key)
    ? { kind: "benchmark", id: key as string }
    : null;
}

export function sortFromUrl(
  key: string | null,
  direction: string | null,
  benchmarks: readonly Benchmark[],
): SortState {
  const column = columnFromKey(key, benchmarks);

  if (!column) return DEFAULT_SORT;

  return {
    column,
    direction:
      direction === "asc" || direction === "desc"
        ? direction
        : defaultDirectionFor(column),
  };
}

export function sortKey(column: SortColumn) {
  return column.kind === "benchmark" ? column.id : column.kind;
}

export function isDefaultSort(sort: SortState) {
  return sort.column.kind === "index" && sort.direction === "desc";
}

export function needsDirectionParameter(
  column: SortColumn,
  direction: SortDirection,
) {
  return direction !== defaultDirectionFor(column);
}

export function rowFromFragment(
  fragment: string,
  rows: readonly LeaderboardRow[],
) {
  let decoded: string;

  try {
    decoded = decodeURIComponent(fragment).toLocaleLowerCase("en");
  } catch {
    return null;
  }

  return (
    rows.find(
      (row) =>
        modelFragment(row.model.name) === decoded ||
        row.model.id.toLocaleLowerCase("en") === decoded,
    ) ?? null
  );
}
