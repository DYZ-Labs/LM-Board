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

/** Which projection of the dataset is on screen. */
export type ViewMode = "table" | "profile" | "plot";
export type Density = "comfortable" | "compact" | "data";

const views = new Set<ViewMode>(["table", "profile", "plot"]);
const densities = new Set<Density>(["comfortable", "compact", "data"]);

/**
 * The server always renders `table`: it is the fullest markup, so every number
 * is in the static HTML for search engines and for anyone with JS disabled.
 * Narrow viewports switch to `profile` on mount unless the URL says otherwise
 * — see the hydration effect in Leaderboard.tsx.
 */
export const DEFAULT_VIEW: ViewMode = "table";
export const DEFAULT_DENSITY: Density = "compact";

/**
 * Below this the eight-column table cannot fit without sideways scrolling:
 * 52 + 264 + 128 + 8x108 + 116 = 1424px of columns, plus the page gutter. It
 * matches the media query in projections.css that lets the table go fluid.
 */
export const PROFILE_BREAKPOINT = 1440;

export function viewFromUrl(value: string | null): ViewMode | null {
  return value && views.has(value as ViewMode) ? (value as ViewMode) : null;
}

export function densityFromUrl(value: string | null): Density {
  return value && densities.has(value as Density)
    ? (value as Density)
    : DEFAULT_DENSITY;
}

/** Model ids for /compare, deduplicated and capped so the grid stays readable. */
export const MAX_COMPARE = 4;

export function compareFromUrl(value: string | null): string[] {
  if (!value) return [];

  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim().toLocaleLowerCase("en"))
        .filter((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)),
    ),
  ].slice(0, MAX_COMPARE);
}

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
