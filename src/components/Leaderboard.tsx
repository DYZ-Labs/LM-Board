"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { CategoryTabs, type Category } from "@/components/CategoryTabs";
import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { FilterBar } from "@/components/FilterBar";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { toCommandPalettePayload } from "@/lib/commandPalette";
import {
  expandLeaderboardClientPayload,
  type LeaderboardClientPayload,
} from "@/lib/leaderboardPayload";
import { matchesModelQuery } from "@/lib/search";
import {
  DEFAULT_SORT,
  nextDirectionFor,
  sortLeaderboardRows,
  type SortColumn,
} from "@/lib/useSort";
import {
  DEFAULT_DENSITY,
  DEFAULT_VIEW,
  canonicalizeBoardState,
  modelFragment,
  parseBoardUrl,
  serializeBoardUrl,
  type BoardUrlState,
  type ProviderSelection,
  type ViewMode,
} from "@/lib/urlState";

const BOARD_PANEL_ID = "board-panel";
const SEARCH_COMMIT_MS = 750;
const ScatterPlot = dynamic(
  () =>
    import("@/components/ScatterPlot").then((module) => module.ScatterPlot),
  {
    loading: () => (
      <div className="compare-empty" aria-busy="true">
        Loading price view…
      </div>
    ),
  },
);
type UrlTransaction = {
  snapshot: BoardUrlState;
  changed: boolean;
};

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

/**
 * A projection swap changes the whole board silhouette. Chrome can preserve
 * its visual continuity; unsupported browsers and reduced-motion users receive
 * the same synchronous state change without a second code path.
 */
export function transitionBoardProjection(update: () => void) {
  const startViewTransition = (document as TransitionDocument)
    .startViewTransition;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (typeof startViewTransition !== "function" || reduceMotion) {
    update();
    return;
  }

  let applied = false;
  const apply = () => {
    if (applied) return;
    applied = true;
    flushSync(update);
  };

  try {
    startViewTransition.call(document, apply);
  } catch {
    // A hidden document or an implementation-specific rejection must never
    // make the projection control inert.
    if (!applied) update();
  }
}

type LeaderboardProps = {
  payload: LeaderboardClientPayload;
  minimumCoverageCount: number;
  percentBenchmarkCount: number;
};

export function Leaderboard({
  payload,
  minimumCoverageCount,
  percentBenchmarkCount,
}: LeaderboardProps) {
  const data = useMemo(
    () => expandLeaderboardClientPayload(payload),
    [payload],
  );
  const commandPalettePayload = useMemo(
    () => toCommandPalettePayload(data.rows, data.benchmarks),
    [data.benchmarks, data.rows],
  );
  const urlContext = useMemo(
    () => ({
      benchmarks: data.benchmarks,
      labs: data.labs,
      rows: data.rows,
    }),
    [data.benchmarks, data.labs, data.rows],
  );
  const initialState = useMemo<BoardUrlState>(
    () => ({
      category: "overall",
      sort: DEFAULT_SORT,
      view: DEFAULT_VIEW,
      viewExplicit: false,
      density: DEFAULT_DENSITY,
      query: "",
      providers: null,
      openWeightsOnly: false,
      expandedModelId: null,
    }),
    [],
  );
  const [boardState, setBoardState] = useState(initialState);
  const [urlStateReady, setUrlStateReady] = useState(false);
  const boardStateRef = useRef(boardState);
  const urlStateReadyRef = useRef(false);
  const searchTransactionRef = useRef<UrlTransaction | null>(null);
  const filterTransactionRef = useRef<UrlTransaction | null>(null);
  const searchCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const commandBarRef = useRef<HTMLDivElement | null>(null);
  const {
    category,
    density,
    expandedModelId,
    openWeightsOnly,
    providers,
    query,
    sort,
    view,
  } = boardState;

  const bestScores = useMemo(
    () =>
      Object.fromEntries(
        data.benchmarks.map((benchmark) => {
          const values = data.rows
            .map((row) => row.scoresByBenchmark[benchmark.id]?.value ?? null)
            .filter((value): value is number => value !== null);

          return [benchmark.id, values.length > 0 ? Math.max(...values) : null];
        }),
      ),
    [data.benchmarks, data.rows],
  );

  const visibleBenchmarks = useMemo(
    () =>
      category === "overall"
        ? data.benchmarks
        : data.benchmarks.filter((benchmark) => benchmark.category === category),
    [category, data.benchmarks],
  );
  const filteredRows = useMemo(
    () =>
      data.rows.filter((row) => {
        const matchesLab =
          providers === null || providers.includes(row.model.lab);
        const matchesWeights = !openWeightsOnly || row.model.openWeights;
        const matchesQuery = matchesModelQuery(query, row);

        return matchesLab && matchesWeights && matchesQuery;
      }),
    [data.rows, openWeightsOnly, providers, query],
  );
  const sortedRows = useMemo(
    () => sortLeaderboardRows(filteredRows, sort, category),
    [category, filteredRows, sort],
  );
  const sortLabel = useMemo(() => {
    const scopeLabel =
      category === "overall"
        ? "Overall"
        : `${category.charAt(0).toUpperCase()}${category.slice(1)}`;

    switch (sort.column.kind) {
      case "rank":
        return `${scopeLabel} rank`;
      case "model":
        return "model name";
      case "index":
        return `${scopeLabel} index`;
      case "price":
        return "input price";
      case "benchmark": {
        const benchmarkId = sort.column.id;
        return (
          data.benchmarks.find((benchmark) => benchmark.id === benchmarkId)
            ?.name ?? "benchmark score"
        );
      }
    }
  }, [category, data.benchmarks, sort.column]);

  const canonicalizeState = useCallback(
    (next: BoardUrlState) => canonicalizeBoardState(next, urlContext),
    [urlContext],
  );

  const publishState = useCallback(
    (next: BoardUrlState, historyMode: "push" | "replace") => {
      const canonical = canonicalizeState(next);
      boardStateRef.current = canonical;
      setBoardState(canonical);

      if (!urlStateReadyRef.current) return;

      const url = serializeBoardUrl(
        new URL(window.location.href),
        canonical,
        urlContext,
      );
      const historyState = {
        ...(window.history.state ?? {}),
        lmboard: true,
      };

      if (historyMode === "push") {
        window.history.pushState(historyState, "", url);
      } else {
        window.history.replaceState(historyState, "", url);
      }
    },
    [canonicalizeState, urlContext],
  );

  /**
   * The command bar's measured height, published once for every consumer.
   *
   * It is the only thing pinned above the board, so it is the offset the sticky
   * header row must clear, the offset `scrollIntoView` has to leave for an
   * expanded row, and the offset a fragment link needs. Three readers, one
   * measurement: the height changes with the viewport (the bar wraps to two and
   * then four rows), so it cannot be a token, and three observers of one element
   * would be three copies of the same number.
   */
  useEffect(() => {
    const bar = commandBarRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;

    // The border box, not `contentRect`: the bar's own border and bottom
    // padding are 8px of what the header row has to clear.
    const observer = new ResizeObserver(() => {
      const height = Math.round(bar.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--bar-h", `${height}px`);
    });

    observer.observe(bar);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--bar-h");
    };
  }, []);

  useEffect(() => {
    function clearTransactions() {
      if (searchCommitTimerRef.current) {
        clearTimeout(searchCommitTimerRef.current);
        searchCommitTimerRef.current = null;
      }
      searchTransactionRef.current = null;
      filterTransactionRef.current = null;
    }

    function applyLocation(canonicalizeUrl: boolean) {
      clearTransactions();
      const parsed = canonicalizeState(
        parseBoardUrl(new URL(window.location.href), urlContext),
      );
      boardStateRef.current = parsed;
      setBoardState(parsed);
      urlStateReadyRef.current = true;
      setUrlStateReady(true);

      if (canonicalizeUrl) {
        const canonicalUrl = serializeBoardUrl(
          new URL(window.location.href),
          parsed,
          urlContext,
        );
        if (canonicalUrl.href !== window.location.href) {
          window.history.replaceState(window.history.state, "", canonicalUrl);
        }
      }
    }

    applyLocation(true);
    const restoreHistory = () => applyLocation(false);
    window.addEventListener("hashchange", restoreHistory);
    window.addEventListener("popstate", restoreHistory);

    return () => {
      clearTransactions();
      window.removeEventListener("hashchange", restoreHistory);
      window.removeEventListener("popstate", restoreHistory);
    };
  }, [canonicalizeState, urlContext]);

  // A static export cannot know a query string while producing HTML. The
  // pre-paint script marks only deep-linked board state and CSS holds an honest
  // reserved placeholder over the server default. Remove that cover in a
  // layout effect only after the parsed state has committed, so a slow client
  // never flashes the unrelated full table on its way to a shared plot/filter.
  useLayoutEffect(() => {
    if (!urlStateReady) return;

    delete document.documentElement.dataset.boardPending;
    delete document.documentElement.dataset.boardPendingFilters;
  }, [urlStateReady]);

  useEffect(() => {
    if (!urlStateReady || !expandedModelId) return;

    const expandedRow = data.rows.find((row) => row.model.id === expandedModelId);
    if (!expandedRow) return;

    const frame = window.requestAnimationFrame(() => {
      // `nearest` measured a 816px jump from scrollY 850 at 390px and left the
      // panel it had just opened with zero visible pixels. `start` lands the
      // row under the command bar every time — `.model-row` reserves the bar's
      // height as scroll margin.
      document
        .getElementById(modelFragment(expandedRow.model.name))
        ?.scrollIntoView({ block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [category, data.rows, expandedModelId, sort, urlStateReady]);

  function handleCategoryChange(nextCategory: Category) {
    const nextVisibleBenchmarkIds = new Set(
      data.benchmarks
        .filter(
          (benchmark) =>
            nextCategory === "overall" || benchmark.category === nextCategory,
        )
        .map((benchmark) => benchmark.id),
    );

    const nextSort =
      sort.column.kind === "benchmark" &&
      !nextVisibleBenchmarkIds.has(sort.column.id)
        ? DEFAULT_SORT
        : sort;

    publishState(
      { ...boardStateRef.current, category: nextCategory, sort: nextSort },
      "push",
    );
  }

  function requestSort(column: SortColumn) {
    const current = boardStateRef.current;
    publishState(
      {
        ...current,
        sort: {
          column,
          direction: nextDirectionFor(current.sort, column),
        },
      },
      "push",
    );
  }

  function commitSearchTransaction() {
    if (searchCommitTimerRef.current) {
      clearTimeout(searchCommitTimerRef.current);
      searchCommitTimerRef.current = null;
    }
    searchTransactionRef.current = null;
  }

  function scheduleSearchCommit() {
    if (searchCommitTimerRef.current) {
      clearTimeout(searchCommitTimerRef.current);
    }
    searchCommitTimerRef.current = setTimeout(
      commitSearchTransaction,
      SEARCH_COMMIT_MS,
    );
  }

  function updateQuery(nextQuery: string) {
    const current = boardStateRef.current;
    const transaction = searchTransactionRef.current;
    if (!transaction) {
      searchTransactionRef.current = {
        snapshot: current,
        changed: true,
      };
    }

    publishState(
      { ...current, query: nextQuery },
      transaction ? "replace" : "push",
    );
    scheduleSearchCommit();
  }

  function cancelSearchTransaction() {
    const transaction = searchTransactionRef.current;
    if (!transaction) return;
    commitSearchTransaction();
    publishState(transaction.snapshot, "replace");
    window.history.back();
  }

  function beginFilterTransaction() {
    if (filterTransactionRef.current) return;
    filterTransactionRef.current = {
      snapshot: boardStateRef.current,
      changed: false,
    };
    window.history.pushState(
      { ...(window.history.state ?? {}), lmboardFilterOverlay: true },
      "",
      window.location.href,
    );
  }

  function commitFilterTransaction() {
    const transaction = filterTransactionRef.current;
    if (!transaction) return;
    filterTransactionRef.current = null;

    if (!transaction.changed) {
      window.history.back();
      return;
    }

    window.history.replaceState(
      { ...(window.history.state ?? {}), lmboard: true },
      "",
      window.location.href,
    );
  }

  function cancelFilterTransaction() {
    const transaction = filterTransactionRef.current;
    if (!transaction) return;
    filterTransactionRef.current = null;
    boardStateRef.current = transaction.snapshot;
    setBoardState(transaction.snapshot);
    window.history.back();
  }

  function publishFilterChange(next: BoardUrlState) {
    const transaction = filterTransactionRef.current;
    if (transaction) transaction.changed = true;
    publishState(next, transaction ? "replace" : "push");
  }

  function toggleLab(lab: string) {
    const current = boardStateRef.current;
    const selected = new Set(current.providers ?? data.labs);
    if (selected.has(lab)) selected.delete(lab);
    else selected.add(lab);
    const nextProviders = data.labs.filter((provider) =>
      selected.has(provider),
    );

    publishFilterChange({ ...current, providers: nextProviders });
  }

  function setProviders(nextProviders: ProviderSelection) {
    publishFilterChange({
      ...boardStateRef.current,
      providers: nextProviders,
    });
  }

  function setOpenWeightsOnly(checked: boolean) {
    publishFilterChange({
      ...boardStateRef.current,
      openWeightsOnly: checked,
    });
  }

  function clearFilters() {
    commitSearchTransaction();
    filterTransactionRef.current = null;
    publishState(
      {
        ...boardStateRef.current,
        providers: null,
        query: "",
        openWeightsOnly: false,
      },
      "push",
    );
  }

  function toggleDetails(modelId: string) {
    const current = boardStateRef.current;
    publishState(
      {
        ...current,
        expandedModelId:
          current.expandedModelId === modelId ? null : modelId,
      },
      "push",
    );
  }

  function handleViewChange(nextView: ViewMode) {
    if (nextView === boardStateRef.current.view) return;

    transitionBoardProjection(() => {
      publishState(
        {
          ...boardStateRef.current,
          view: nextView,
          viewExplicit: true,
        },
        "push",
      );
    });
  }

  return (
    <section
      className="leaderboard"
      id="leaderboard"
      aria-labelledby="leaderboard-heading"
      aria-busy={!urlStateReady || undefined}
      data-density={density}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Showing {filteredRows.length} of {data.rows.length} models. Sorted by{" "}
        {sortLabel},{" "}
        {sort.direction === "asc" ? "ascending" : "descending"}. Showing{" "}
        {view} projection.
      </p>

      <div className="command-bar" ref={commandBarRef}>
        <div className="command-row command-row-tabs">
          <CategoryTabs
            value={category}
            onChange={handleCategoryChange}
            panelId={BOARD_PANEL_ID}
          />
        </div>
        <FilterBar
          labs={data.labs}
          selectedLabs={providers ?? data.labs}
          providerFilterActive={providers !== null}
          query={query}
          openWeightsOnly={openWeightsOnly}
          resultCount={filteredRows.length}
          totalCount={data.rows.length}
          view={view}
          density={density}
          onQueryChange={updateQuery}
          onQueryCommit={commitSearchTransaction}
          onQueryCancel={cancelSearchTransaction}
          onToggleLab={toggleLab}
          onSetLabs={setProviders}
          onOpenWeightsChange={setOpenWeightsOnly}
          onFilterOpen={beginFilterTransaction}
          onFilterCommit={commitFilterTransaction}
          onFilterCancel={cancelFilterTransaction}
          onClear={clearFilters}
          onViewChange={handleViewChange}
          onDensityChange={(nextDensity) =>
            publishState(
              { ...boardStateRef.current, density: nextDensity },
              "push",
            )
          }
        />
      </div>

      <div
        className="board-shell"
        id={BOARD_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`tab-${category}`}
      >
        {view === "plot" ? (
          <ScatterPlot rows={sortedRows} category={category} />
        ) : (
          <LeaderboardTable
            rows={sortedRows}
            category={category}
            allBenchmarks={data.benchmarks}
            visibleBenchmarks={visibleBenchmarks}
            benchmarkDomains={data.benchmarkDomains}
            bestScores={bestScores}
            sort={sort}
            expandedModelId={expandedModelId}
            view={view}
            minimumCoverageCount={minimumCoverageCount}
            percentBenchmarkCount={percentBenchmarkCount}
            onSort={requestSort}
            onToggleDetails={toggleDetails}
            onClearFilters={clearFilters}
          />
        )}
      </div>

      <DeferredCommandPalette payload={commandPalettePayload} />
    </section>
  );
}
