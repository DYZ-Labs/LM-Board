"use client";

import { useEffect, useMemo, useState } from "react";

import { CategoryTabs, type Category } from "@/components/CategoryTabs";
import { CommandPalette } from "@/components/CommandPalette";
import { FilterBar } from "@/components/FilterBar";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { ScatterPlot } from "@/components/ScatterPlot";
import type { LeaderboardData } from "@/lib/data";
import { DEFAULT_SORT, sortLeaderboardRows, useSort } from "@/lib/useSort";
import {
  DEFAULT_DENSITY,
  DEFAULT_VIEW,
  PROFILE_BREAKPOINT,
  categoryFromUrl,
  densityFromUrl,
  isDefaultSort,
  modelFragment,
  needsDirectionParameter,
  rowFromFragment,
  sortFromUrl,
  sortKey,
  viewFromUrl,
  type Density,
  type ViewMode,
} from "@/lib/urlState";

const BOARD_PANEL_ID = "board-panel";

type LeaderboardProps = {
  data: LeaderboardData;
  minimumCoverageCount: number;
  percentBenchmarkCount: number;
};

export function Leaderboard({
  data,
  minimumCoverageCount,
  percentBenchmarkCount,
}: LeaderboardProps) {
  const [category, setCategory] = useState<Category>("overall");
  const [selectedLabs, setSelectedLabs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [openWeightsOnly, setOpenWeightsOnly] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(DEFAULT_VIEW);
  // The responsive default is not the user's choice, so it must not end up in
  // a shared URL. Only an explicit switch is serialised.
  const [viewExplicit, setViewExplicit] = useState(false);
  const [density, setDensity] = useState<Density>(DEFAULT_DENSITY);
  const [urlStateReady, setUrlStateReady] = useState(false);
  const { sort, setSort, requestSort } = useSort();

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
  const normalizedQuery = query.trim().toLocaleLowerCase("en");
  const filteredRows = useMemo(
    () =>
      data.rows.filter((row) => {
        const matchesLab =
          selectedLabs.length === 0 || selectedLabs.includes(row.model.lab);
        const matchesWeights = !openWeightsOnly || row.model.openWeights;
        const searchText =
          `${row.model.name} ${row.model.lab} ${row.model.id}`.toLocaleLowerCase(
            "en",
          );
        const matchesQuery =
          normalizedQuery.length === 0 || searchText.includes(normalizedQuery);

        return matchesLab && matchesWeights && matchesQuery;
      }),
    [data.rows, normalizedQuery, openWeightsOnly, selectedLabs],
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

  useEffect(() => {
    function applyUrlState() {
      const params = new URLSearchParams(window.location.search);
      const nextCategory = categoryFromUrl(params.get("tab"));
      const requestedSort = sortFromUrl(
        params.get("sort"),
        params.get("direction"),
        data.benchmarks,
      );
      const requestedBenchmarkId =
        requestedSort.column.kind === "benchmark"
          ? requestedSort.column.id
          : null;
      const requestedBenchmark = requestedBenchmarkId
        ? data.benchmarks.find(
            (benchmark) => benchmark.id === requestedBenchmarkId,
          )
        : null;
      const nextSort =
        requestedBenchmark &&
        nextCategory !== "overall" &&
        requestedBenchmark.category !== nextCategory
          ? DEFAULT_SORT
          : requestedSort;
      const fragment = window.location.hash.slice(1);
      const expandedRow = fragment ? rowFromFragment(fragment, data.rows) : null;
      const requestedView = viewFromUrl(params.get("view"));

      setCategory(nextCategory);
      setSort(nextSort);
      setExpandedModelId(expandedRow?.model.id ?? null);
      setDensity(densityFromUrl(params.get("density")));

      if (requestedView) {
        setView(requestedView);
        setViewExplicit(true);
      } else {
        // The server always renders the full table so every number is in the
        // static HTML. Narrow viewports switch to the projection that fits.
        setView(
          window.innerWidth < PROFILE_BREAKPOINT ? "profile" : DEFAULT_VIEW,
        );
        setViewExplicit(false);
      }

      setUrlStateReady(true);
    }

    applyUrlState();
    window.addEventListener("hashchange", applyUrlState);
    window.addEventListener("popstate", applyUrlState);

    return () => {
      window.removeEventListener("hashchange", applyUrlState);
      window.removeEventListener("popstate", applyUrlState);
    };
  }, [data.benchmarks, data.rows, setSort]);

  useEffect(() => {
    if (!urlStateReady) return;

    const url = new URL(window.location.href);

    if (category === "overall") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", category);
    }

    if (isDefaultSort(sort)) {
      url.searchParams.delete("sort");
      url.searchParams.delete("direction");
    } else {
      url.searchParams.set("sort", sortKey(sort.column));

      if (needsDirectionParameter(sort.column, sort.direction)) {
        url.searchParams.set("direction", sort.direction);
      } else {
        url.searchParams.delete("direction");
      }
    }

    if (viewExplicit) {
      url.searchParams.set("view", view);
    } else {
      url.searchParams.delete("view");
    }

    if (density === DEFAULT_DENSITY) {
      url.searchParams.delete("density");
    } else {
      url.searchParams.set("density", density);
    }

    const expandedRow = expandedModelId
      ? data.rows.find((row) => row.model.id === expandedModelId)
      : null;

    if (expandedRow) {
      url.hash = modelFragment(expandedRow.model.name);
    } else if (url.hash && rowFromFragment(url.hash.slice(1), data.rows)) {
      url.hash = "";
    }

    window.history.replaceState(window.history.state, "", url);
  }, [
    category,
    data.rows,
    density,
    expandedModelId,
    sort,
    urlStateReady,
    view,
    viewExplicit,
  ]);

  useEffect(() => {
    if (!urlStateReady || !expandedModelId) return;

    const expandedRow = data.rows.find((row) => row.model.id === expandedModelId);
    if (!expandedRow) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(modelFragment(expandedRow.model.name))
        ?.scrollIntoView({ block: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [category, data.rows, expandedModelId, sort, urlStateReady]);

  useEffect(() => {
    if (
      expandedModelId &&
      !filteredRows.some((row) => row.model.id === expandedModelId)
    ) {
      setExpandedModelId(null);
    }
  }, [expandedModelId, filteredRows]);

  function handleCategoryChange(nextCategory: Category) {
    const nextVisibleBenchmarkIds = new Set(
      data.benchmarks
        .filter(
          (benchmark) =>
            nextCategory === "overall" || benchmark.category === nextCategory,
        )
        .map((benchmark) => benchmark.id),
    );

    if (
      sort.column.kind === "benchmark" &&
      !nextVisibleBenchmarkIds.has(sort.column.id)
    ) {
      setSort(DEFAULT_SORT);
    }

    setCategory(nextCategory);
  }

  function toggleLab(lab: string) {
    setSelectedLabs((current) =>
      current.includes(lab)
        ? current.filter((selectedLab) => selectedLab !== lab)
        : [...current, lab],
    );
  }

  function clearFilters() {
    setSelectedLabs([]);
    setQuery("");
    setOpenWeightsOnly(false);
  }

  function toggleDetails(modelId: string) {
    setExpandedModelId((current) => (current === modelId ? null : modelId));
  }

  function handleViewChange(nextView: ViewMode) {
    setView(nextView);
    setViewExplicit(true);
  }

  return (
    <section
      className="leaderboard"
      id="leaderboard"
      aria-labelledby="leaderboard-heading"
      data-density={density}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Sorted by {sortLabel},{" "}
        {sort.direction === "asc" ? "ascending" : "descending"}. Showing{" "}
        {view} projection.
      </p>

      <div className="command-bar">
        <div className="command-row command-row-tabs">
          <CategoryTabs
            value={category}
            onChange={handleCategoryChange}
            panelId={BOARD_PANEL_ID}
          />
        </div>
        <FilterBar
          labs={data.labs}
          selectedLabs={selectedLabs}
          query={query}
          openWeightsOnly={openWeightsOnly}
          resultCount={filteredRows.length}
          totalCount={data.rows.length}
          view={view}
          density={density}
          onQueryChange={setQuery}
          onToggleLab={toggleLab}
          onOpenWeightsChange={setOpenWeightsOnly}
          onClear={clearFilters}
          onViewChange={handleViewChange}
          onDensityChange={setDensity}
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

      <CommandPalette rows={data.rows} benchmarks={data.benchmarks} />
    </section>
  );
}
