"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";

import { DetailPanel } from "@/components/DetailPanel";
import { Badge } from "@/components/Badge";
import { ScoreCell } from "@/components/ScoreCell";
import { Tooltip } from "@/components/Tooltip";
import type { LeaderboardRow } from "@/lib/data";
import type { Benchmark } from "@/lib/schema";
import {
  isActiveSortColumn,
  nextDirectionFor,
  type SortColumn,
  type SortState,
} from "@/lib/useSort";

const indexFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const priceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
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
    : "↕";

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
          <span className="sort-indicator" aria-hidden="true">
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
  allBenchmarks: Benchmark[];
  visibleBenchmarks: Benchmark[];
  bestScores: Record<string, number>;
  sort: SortState;
  expandedModelId: string | null;
  onSort: (column: SortColumn) => void;
  onToggleDetails: (modelId: string) => void;
};

export function LeaderboardTable({
  rows,
  allBenchmarks,
  visibleBenchmarks,
  bestScores,
  sort,
  expandedModelId,
  onSort,
  onToggleDetails,
}: LeaderboardTableProps) {
  const columnCount = 4 + visibleBenchmarks.length;
  const tableStyle = {
    "--benchmark-count": visibleBenchmarks.length,
  } as CSSProperties;

  return (
    <>
      <p className="table-scroll-instructions" id="table-scroll-instructions">
        Scroll horizontally for more benchmarks. The model column remains
        visible; the table header remains pinned while scrolling vertically.
      </p>
      <div
        className="table-scroll"
        role="region"
        tabIndex={0}
        aria-labelledby="leaderboard-heading"
        aria-describedby="table-scroll-instructions"
      >
        <table
          className="leaderboard-table"
          style={tableStyle}
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
              <SortableHeader
                column={{ kind: "index" }}
                label="LM Board Index"
                sort={sort}
                onSort={onSort}
                className="index-column"
              >
                Index
              </SortableHeader>
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
                label="input price per million tokens"
                sort={sort}
                onSort={onSort}
                className="price-column"
              >
                <>
                  Price
                  <span className="header-note"> in / out</span>
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

              return (
                <Fragment key={row.model.id}>
                  <tr
                    className={
                      expanded ? "model-row is-expanded" : "model-row"
                    }
                    onClick={() => onToggleDetails(row.model.id)}
                  >
                    <td className="rank-cell">
                      {row.rank === null ? (
                        <span className="missing-value">—</span>
                      ) : (
                        row.rank
                      )}
                    </td>
                    <th scope="row" className="model-cell">
                      <button
                        type="button"
                        className="model-trigger"
                        aria-expanded={expanded}
                        aria-controls={`details-${row.model.id}`}
                        aria-label={`${expanded ? "Hide" : "Show"} details for ${row.model.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleDetails(row.model.id);
                        }}
                      >
                        <span className="model-name">{row.model.name}</span>
                        <span className="disclosure-icon" aria-hidden="true">
                          {expanded ? "−" : "+"}
                        </span>
                      </button>
                      <span className="model-meta">
                        {row.model.lab}
                        {row.model.openWeights ? (
                          <Badge className="open-weights-label">
                            Open weights
                          </Badge>
                        ) : null}
                      </span>
                    </th>
                    <td className="numeric-cell index-cell">
                      {row.index === null ? (
                        <span className="insufficient-label">
                          Insufficient data
                        </span>
                      ) : (
                        indexFormatter.format(row.index)
                      )}
                    </td>
                    {visibleBenchmarks.map((benchmark) => (
                      <ScoreCell
                        key={benchmark.id}
                        score={row.scoresByBenchmark[benchmark.id]}
                        unit={benchmark.unit}
                        isBest={
                          row.scoresByBenchmark[benchmark.id]?.value ===
                          bestScores[benchmark.id]
                        }
                      />
                    ))}
                    <td className="numeric-cell price-cell">
                      {row.model.pricing ? (
                        <>
                          <span>
                            ${priceFormatter.format(row.model.pricing.input)} / $
                            {priceFormatter.format(row.model.pricing.output)}
                          </span>
                          <small>per Mtok</small>
                        </>
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
