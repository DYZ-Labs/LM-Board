import { RANK_SCOPES, type RankScope } from "@/lib/categories";
import type { LeaderboardClientRow } from "@/lib/data";
import { matchesModelQuery } from "@/lib/search";
import type { Benchmark } from "@/lib/schema";
import {
  DEFAULT_SORT,
  defaultDirectionFor,
  type SortColumn,
  type SortDirection,
  type SortState,
} from "@/lib/useSort";

const categories = new Set<RankScope>(RANK_SCOPES);

/** Which projection of the dataset is on screen. */
export type ViewMode = "table" | "profile" | "plot";
export type Density = "comfortable" | "compact" | "data";
/**
 * `null` is the canonical unfiltered state: every provider is included.
 * An empty array is deliberately different — the visitor explicitly selected
 * no providers, so the board is empty and the URL records `labs=none`.
 */
export type ProviderSelection = string[] | null;

export type BoardUrlState = {
  category: RankScope;
  sort: SortState;
  view: ViewMode;
  viewExplicit: boolean;
  density: Density;
  query: string;
  providers: ProviderSelection;
  openWeightsOnly: boolean;
  expandedModelId: string | null;
};

export type BoardUrlContext = {
  benchmarks: readonly Benchmark[];
  labs: readonly string[];
  rows: readonly LeaderboardClientRow[];
};

const views = new Set<ViewMode>(["table", "profile", "plot"]);
const densities = new Set<Density>(["comfortable", "compact", "data"]);

/**
 * The server and client both default to `table`: it is the fullest markup, so
 * every number remains in the static HTML and hydration never swaps the board
 * into a different projection based on viewport timing. CSS owns responsive
 * presentation; another projection appears only after an explicit choice.
 */
export const DEFAULT_VIEW: ViewMode = "table";
export const DEFAULT_DENSITY: Density = "compact";

export function viewFromUrl(value: string | null): ViewMode | null {
  return value && views.has(value as ViewMode) ? (value as ViewMode) : null;
}

export function densityFromUrl(value: string | null): Density {
  return value && densities.has(value as Density)
    ? (value as Density)
    : DEFAULT_DENSITY;
}

/* -- Filters --------------------------------------------------------------
   Search, provider and open-weights are as much a description of "the board I
   am looking at" as the tab or the sort, so they belong in the URL: without
   them the Copy view action hands someone a link to a different board than the
   one on screen. Each parser fails closed to "no filter", so a hand-edited or
   truncated URL can never land on an empty board it cannot explain. */

export function queryFromUrl(value: string | null): string {
  return value?.trim() ?? "";
}

/**
 * Provider names, resolved case-insensitively against the dataset's own list.
 * Matching rather than trusting matters: an arbitrary string would filter every
 * row away and leave the visitor on an empty board with no way to tell why.
 */
export function labsFromUrl(
  value: string | null,
  labs: readonly string[],
): string[] {
  if (!value) return [];

  const byLowercaseName = new Map(
    labs.map((lab) => [lab.toLocaleLowerCase("en"), lab]),
  );

  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => byLowercaseName.get(entry.trim().toLocaleLowerCase("en")))
        .filter((lab): lab is string => lab != null),
    ),
  ];
}

/**
 * Provider selection with truthful three-state semantics.
 *
 * - absent: all providers (`null`)
 * - `none`: explicitly no providers (`[]`)
 * - a validated, dataset-ordered subset
 *
 * A URL naming every provider is canonicalised to the absent/default form.
 */
export function providersFromUrl(
  value: string | null,
  labs: readonly string[],
): ProviderSelection {
  if (value === null) return null;
  if (value.trim().toLocaleLowerCase("en") === "none") return [];

  const selected = labsFromUrl(value, labs);
  if (selected.length === 0 || selected.length === labs.length) return null;

  const selectedSet = new Set(selected);
  return labs.filter((lab) => selectedSet.has(lab));
}

export function openWeightsFromUrl(value: string | null): boolean {
  return value === "1";
}

/** Model ids for /compare, deduplicated and capped so the grid stays readable. */
export const MAX_COMPARE = 4;

export function compareFromUrl(
  value: string | null,
  availableIds?: readonly string[],
): string[] {
  if (!value) return [];

  const available = availableIds
    ? new Set(
        availableIds.map((id) => id.trim().toLocaleLowerCase("en")),
      )
    : null;

  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim().toLocaleLowerCase("en"))
        .filter(
          (id) =>
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) &&
            (available == null || available.has(id)),
        ),
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

export function categoryFromUrl(value: string | null): RankScope {
  return value && categories.has(value as RankScope)
    ? (value as RankScope)
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
  rows: readonly LeaderboardClientRow[],
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

function canonicalSortForCategory(
  category: RankScope,
  sort: SortState,
  benchmarks: readonly Benchmark[],
) {
  if (sort.column.kind !== "benchmark" || category === "overall") return sort;

  const benchmarkId = sort.column.id;
  const benchmark = benchmarks.find(
    (candidate) => candidate.id === benchmarkId,
  );
  return benchmark?.category === category ? sort : DEFAULT_SORT;
}

/**
 * Canonicalise state once for every caller: event handlers, URL hydration and
 * serialization all share these invariants instead of repairing them in
 * separate effects.
 */
export function canonicalizeBoardState(
  state: BoardUrlState,
  context: BoardUrlContext,
): BoardUrlState {
  let providers = state.providers;
  if (providers !== null) {
    const selected = new Set(providers);
    const ordered = context.labs.filter((lab) => selected.has(lab));
    providers = ordered.length === context.labs.length ? null : ordered;
  }

  const candidate: BoardUrlState = {
    ...state,
    providers,
    sort: canonicalSortForCategory(
      state.category,
      state.sort,
      context.benchmarks,
    ),
  };
  const expandedVisible =
    candidate.expandedModelId === null ||
    context.rows.some(
      (row) =>
        row.model.id === candidate.expandedModelId &&
        (candidate.providers === null ||
          candidate.providers.includes(row.model.lab)) &&
        (!candidate.openWeightsOnly || row.model.openWeights) &&
        matchesModelQuery(candidate.query, row),
    );

  return expandedVisible
    ? candidate
    : { ...candidate, expandedModelId: null };
}

/** Parse every board-owned URL field through one typed, fail-closed path. */
export function parseBoardUrl(
  url: URL,
  context: BoardUrlContext,
): BoardUrlState {
  const category = categoryFromUrl(url.searchParams.get("tab"));
  const parsedSort = sortFromUrl(
    url.searchParams.get("sort"),
    url.searchParams.get("direction"),
    context.benchmarks,
  );
  const requestedView = viewFromUrl(url.searchParams.get("view"));
  const fragment = url.hash.slice(1);
  const expandedRow = fragment
    ? rowFromFragment(fragment, context.rows)
    : null;

  return canonicalizeBoardState(
    {
      category,
      sort: parsedSort,
      view: requestedView ?? DEFAULT_VIEW,
      viewExplicit: requestedView !== null,
      density: densityFromUrl(url.searchParams.get("density")),
      query: queryFromUrl(url.searchParams.get("q")),
      providers: providersFromUrl(
        url.searchParams.get("labs"),
        context.labs,
      ),
      openWeightsOnly: openWeightsFromUrl(url.searchParams.get("open")),
      expandedModelId: expandedRow?.model.id ?? null,
    },
    context,
  );
}

/**
 * Serialize only fields LM Board owns. Foreign query parameters and hashes are
 * retained; a hash is removed only when it resolves to a known model that is no
 * longer expanded.
 */
export function serializeBoardUrl(
  current: URL,
  state: BoardUrlState,
  context: BoardUrlContext,
): URL {
  const url = new URL(current);
  const canonical = canonicalizeBoardState(state, context);

  if (canonical.category === "overall") url.searchParams.delete("tab");
  else url.searchParams.set("tab", canonical.category);

  if (isDefaultSort(canonical.sort)) {
    url.searchParams.delete("sort");
    url.searchParams.delete("direction");
  } else {
    url.searchParams.set("sort", sortKey(canonical.sort.column));
    if (
      needsDirectionParameter(
        canonical.sort.column,
        canonical.sort.direction,
      )
    ) {
      url.searchParams.set("direction", canonical.sort.direction);
    } else {
      url.searchParams.delete("direction");
    }
  }

  if (canonical.viewExplicit) url.searchParams.set("view", canonical.view);
  else url.searchParams.delete("view");

  if (canonical.density === DEFAULT_DENSITY) {
    url.searchParams.delete("density");
  } else {
    url.searchParams.set("density", canonical.density);
  }

  const trimmedQuery = canonical.query.trim();
  if (trimmedQuery) url.searchParams.set("q", trimmedQuery);
  else url.searchParams.delete("q");

  if (canonical.providers === null) {
    url.searchParams.delete("labs");
  } else if (canonical.providers.length === 0) {
    url.searchParams.set("labs", "none");
  } else {
    const selected = new Set(canonical.providers);
    const ordered = context.labs.filter((lab) => selected.has(lab));
    if (ordered.length === context.labs.length) {
      url.searchParams.delete("labs");
    } else {
      url.searchParams.set("labs", ordered.join(","));
    }
  }

  if (canonical.openWeightsOnly) url.searchParams.set("open", "1");
  else url.searchParams.delete("open");

  const expandedRow = canonical.expandedModelId
    ? context.rows.find((row) => row.model.id === canonical.expandedModelId)
    : null;
  if (expandedRow) {
    url.hash = modelFragment(expandedRow.model.name);
  } else if (url.hash && rowFromFragment(url.hash.slice(1), context.rows)) {
    url.hash = "";
  }

  return url;
}
