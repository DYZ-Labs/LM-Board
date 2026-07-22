"use client";

import {
  Fragment,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { DetailPanel } from "@/components/DetailPanel";
import { Badge } from "@/components/Badge";
import { ScoreCell } from "@/components/ScoreCell";
import { Tooltip } from "@/components/Tooltip";
import type { LeaderboardRow } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import type { RankScope } from "@/lib/index";
import type { Benchmark } from "@/lib/schema";
import { modelFragment } from "@/lib/urlState";
import {
  isActiveSortColumn,
  nextDirectionFor,
  type SortColumn,
  type SortState,
} from "@/lib/useSort";

const indexFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const compactBenchmarkLabels: Record<string, string> = {
  "gpqa-diamond": "GPQA",
  hle: "HLE",
  "aa-lcr": "LCR",
  ifbench: "IFBench",
  critpt: "CritPt",
  "terminal-bench-v2-1": "T-Bench 2.1",
  scicode: "SciCode",
  "tau3-banking": "τ³-Bank",
};

type SortableHeaderProps = {
  column: SortColumn;
  label: string;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  children?: ReactNode;
  className?: string;
  tooltip?: ReactNode;
};

function SortableHeader({
  column,
  label,
  sort,
  onSort,
  children,
  className,
  tooltip,
}: SortableHeaderProps) {
  const active = isActiveSortColumn(sort, column);
  const nextDirection = nextDirectionFor(sort, column);
  const indicator = active
    ? sort.direction === "asc"
      ? "↑"
      : "↓"
    : nextDirection === "asc"
      ? "↑"
      : "↓";

  return (
    <th
      scope="col"
      className={className}
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <div className="column-header-controls">
        <button
          type="button"
          className="sort-button"
          onClick={() => onSort(column)}
          aria-label={`Sort by ${label} ${nextDirection === "asc" ? "ascending" : "descending"}`}
        >
          <span>{children ?? label}</span>
          <span
            className={`sort-indicator${active ? " is-active" : ""}`}
            aria-hidden="true"
          >
            {indicator}
          </span>
        </button>
        {tooltip}
      </div>
    </th>
  );
}

type LeaderboardTableProps = {
  rows: LeaderboardRow[];
  category: RankScope;
  allBenchmarks: Benchmark[];
  visibleBenchmarks: Benchmark[];
  bestScores: Record<string, number | null>;
  sort: SortState;
  expandedModelId: string | null;
  onSort: (column: SortColumn) => void;
  onToggleDetails: (modelId: string) => void;
};

export function LeaderboardTable({
  rows,
  category,
  allBenchmarks,
  visibleBenchmarks,
  bestScores,
  sort,
  expandedModelId,
  onSort,
  onToggleDetails,
}: LeaderboardTableProps) {
  const [hasHorizontalScrollOffset, setHasHorizontalScrollOffset] =
    useState(false);
  const showIndexColumn = visibleBenchmarks.length !== 1;
  const columnCount = 3 + visibleBenchmarks.length + Number(showIndexColumn);
  const isSparse = visibleBenchmarks.length <= 2;
  const tableStyle = {
    "--benchmark-count": visibleBenchmarks.length,
  } as CSSProperties;
  const scopeLabel =
    category === "overall"
      ? "Overall"
      : `${category.charAt(0).toUpperCase()}${category.slice(1)}`;

  return (
    <>
      <p className="table-scroll-instructions" id="table-scroll-instructions">
        Scroll for benchmarks · Model stays pinned
      </p>
      <div
        className={`table-scroll${hasHorizontalScrollOffset ? " is-horizontally-scrolled" : ""}`}
        role="region"
        tabIndex={0}
        aria-labelledby="leaderboard-heading"
        aria-describedby="table-scroll-instructions"
        onScroll={(event) => {
          const isScrolled = event.currentTarget.scrollLeft > 0;
          setHasHorizontalScrollOffset((current) =>
            current === isScrolled ? current : isScrolled,
          );
        }}
      >
        <table
          className="leaderboard-table"
          style={tableStyle}
          data-sparse={isSparse ? "true" : undefined}
        >
          <caption className="sr-only">
            Frontier language models ranked by the LM Board Index. Activate a
            column heading to sort or a model name to view its score sources.
          </caption>
          <thead>
            <tr>
              <SortableHeader
                column={{ kind: "rank" }}
                label="Rank"
                sort={sort}
                onSort={onSort}
                className="rank-column"
              />
              <SortableHeader
                column={{ kind: "model" }}
                label="Model"
                sort={sort}
                onSort={onSort}
                className="model-column"
              />
              {showIndexColumn ? (
                <SortableHeader
                  column={{ kind: "index" }}
                  label={`${scopeLabel} index`}
                  sort={sort}
                  onSort={onSort}
                  className="index-column"
                >
                  {category === "overall" ? "Index" : `${scopeLabel} Index`}
                </SortableHeader>
              ) : null}
              {visibleBenchmarks.map((benchmark) => (
                <SortableHeader
                  key={benchmark.id}
                  column={{ kind: "benchmark", id: benchmark.id }}
                  label={benchmark.name}
                  sort={sort}
                  onSort={onSort}
                  className="benchmark-column"
                  tooltip={
                    <Tooltip
                      label={benchmark.name}
                      description={benchmark.description}
                      meta={`${benchmark.unit === "percent" ? "Percent score on a 0–100 scale" : "Numeric benchmark score"}. Per-model evaluation settings are available in row details.`}
                      sourceUrl={benchmark.sourceUrl}
                    />
                  }
                >
                  <span aria-hidden="true">
                    {compactBenchmarkLabels[benchmark.id] ?? benchmark.name}
                  </span>
                </SortableHeader>
              ))}
              <SortableHeader
                column={{ kind: "price" }}
                label="input and output price per million tokens"
                sort={sort}
                onSort={onSort}
                className="price-column"
              >
                <>
                  Price
                  <span className="header-note"> in / out · per Mtok</span>
                </>
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={columnCount}>
                  <strong>No models match these filters.</strong>
                  <span>Try a different search or clear a filter.</span>
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const expanded = expandedModelId === row.model.id;
              const activeScope = row.scopes[category];
              const modelLabel = row.reasoningEffort
                ? `${row.model.name} (${row.reasoningEffort})`
                : row.model.name;

              return (
                <Fragment key={row.model.id}>
                  <tr
                    id={modelFragment(row.model.name)}
                    className={
                      expanded ? "model-row is-expanded" : "model-row"
                    }
                    onClick={() => onToggleDetails(row.model.id)}
                  >
                    <td className="rank-cell">
                      {activeScope.rank === null ? (
                        <span className="missing-value">—</span>
                      ) : (
                        activeScope.rank
                      )}
                    </td>
                    <th scope="row" className="model-cell">
                      <div className="model-primary-line">
                        <span
                          className="mobile-rank"
                          aria-label={
                            activeScope.rank === null
                              ? "Unranked"
                              : `Rank ${activeScope.rank}`
                          }
                        >
                          {activeScope.rank === null
                            ? "—"
                            : `#${activeScope.rank}`}
                        </span>
                        <button
                          type="button"
                          className="model-trigger"
                          aria-expanded={expanded}
                          aria-controls={`details-${row.model.id}`}
                          aria-label={`${expanded ? "Hide" : "Show"} details for ${modelLabel}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleDetails(row.model.id);
                          }}
                        >
                          <span className="model-identification">
                            <span className="model-name">{row.model.name}</span>
                            {row.reasoningEffortLabel ? (
                              <Badge className="reasoning-effort-label">
                                <span title={row.reasoningEffort ?? undefined}>
                                  {row.reasoningEffortLabel}
                                </span>
                              </Badge>
                            ) : null}
                          </span>
                          <span className="disclosure-icon" aria-hidden="true">
                            {expanded ? "−" : "+"}
                          </span>
                        </button>
                      </div>
                      <span className="model-meta">
                        {row.model.lab}
                        {row.model.openWeights ? (
                          <Badge className="open-weights-label">
                            Open weights
                          </Badge>
                        ) : null}
                      </span>
                    </th>
                    {showIndexColumn ? (
                      <td className="numeric-cell index-cell">
                        {activeScope.index === null ? (
                          <span className="insufficient-label">
                            Insufficient data
                          </span>
                        ) : (
                          indexFormatter.format(activeScope.index)
                        )}
                      </td>
                    ) : null}
                    {visibleBenchmarks.map((benchmark) => (
                      <ScoreCell
                        key={benchmark.id}
                        score={row.scoresByBenchmark[benchmark.id]}
                        isBest={
                          row.scoresByBenchmark[benchmark.id]?.value ===
                          bestScores[benchmark.id]
                        }
                      />
                    ))}
                    <td className="numeric-cell price-cell">
                      {row.model.pricing ? (
                        <span>
                          ${formatPrice(row.model.pricing.input)} / $
                          {formatPrice(row.model.pricing.output)}
                        </span>
                      ) : (
                        <span className="missing-value">—</span>
                      )}
                    </td>
                  </tr>
                  {expanded ? (
                    <DetailPanel
                      row={row}
                      benchmarks={allBenchmarks}
                      colSpan={columnCount}
                    />
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
