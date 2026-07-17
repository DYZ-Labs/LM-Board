"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CategoryTabs,
  type Category,
} from "@/components/CategoryTabs";
import { FilterBar } from "@/components/FilterBar";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import type { LeaderboardData } from "@/lib/data";
import {
  DEFAULT_SORT,
  sortLeaderboardRows,
  useSort,
} from "@/lib/useSort";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

type LeaderboardProps = {
  data: LeaderboardData;
};

export function Leaderboard({ data }: LeaderboardProps) {
  const [category, setCategory] = useState<Category>("overall");
  const [selectedLabs, setSelectedLabs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [openWeightsOnly, setOpenWeightsOnly] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const { sort, setSort, requestSort } = useSort();

  const bestScores = useMemo(
    () =>
      Object.fromEntries(
        data.benchmarks.map((benchmark) => {
          const values = data.rows
            .map(
              (row) => row.scoresByBenchmark[benchmark.id]?.value ?? null,
            )
            .filter((value): value is number => value !== null);

          return [benchmark.id, Math.max(...values)];
        }),
      ),
    [data.benchmarks, data.rows],
  );

  const visibleBenchmarks = useMemo(
    () =>
      category === "overall"
        ? data.benchmarks
        : data.benchmarks.filter(
            (benchmark) => benchmark.category === category,
          ),
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
    () => sortLeaderboardRows(filteredRows, sort),
    [filteredRows, sort],
  );
  const sortLabel = useMemo(() => {
    switch (sort.column.kind) {
      case "rank":
        return "rank";
      case "model":
        return "model name";
      case "index":
        return "LM Board Index";
      case "price":
        return "input price";
      case "benchmark": {
        const benchmarkId = sort.column.id;
        return (
          data.benchmarks.find(
            (benchmark) => benchmark.id === benchmarkId,
          )?.name ?? "benchmark score"
        );
      }
    }
  }, [data.benchmarks, sort.column]);

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
            nextCategory === "overall" ||
            benchmark.category === nextCategory,
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

  return (
    <section className="leaderboard" aria-labelledby="leaderboard-heading">
      <div className="leaderboard-heading-row">
        <div>
          <p className="section-kicker">The leaderboard</p>
          <h2 id="leaderboard-heading">Frontier model performance</h2>
        </div>
        <p className="snapshot-copy">
          {data.rows.length} models · {data.benchmarks.length} benchmarks · Updated{" "}
          <time dateTime={data.lastUpdated}>{formatDate(data.lastUpdated)}</time> · Click a
          model to inspect sources
        </p>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Sorted by {sortLabel}, {sort.direction === "asc" ? "ascending" : "descending"}.
      </p>

      <div className="controls-shell">
        <CategoryTabs value={category} onChange={handleCategoryChange} />
        <FilterBar
          labs={data.labs}
          selectedLabs={selectedLabs}
          query={query}
          openWeightsOnly={openWeightsOnly}
          resultCount={filteredRows.length}
          totalCount={data.rows.length}
          onQueryChange={setQuery}
          onToggleLab={toggleLab}
          onOpenWeightsChange={setOpenWeightsOnly}
          onClear={clearFilters}
        />
      </div>

      <LeaderboardTable
        rows={sortedRows}
        allBenchmarks={data.benchmarks}
        visibleBenchmarks={visibleBenchmarks}
        bestScores={bestScores}
        sort={sort}
        expandedModelId={expandedModelId}
        onSort={requestSort}
        onToggleDetails={toggleDetails}
      />
    </section>
  );
}
