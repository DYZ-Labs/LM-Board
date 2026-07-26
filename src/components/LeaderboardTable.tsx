"use client";

import {
  Fragment,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Badge } from "@/components/Badge";
import { DetailPanel } from "@/components/DetailPanel";
import { ChevronRightIcon } from "@/components/Icon";
import { ScoreCell } from "@/components/ScoreCell";
import { ScoreSpark } from "@/components/ScoreSpark";
import { Tooltip } from "@/components/Tooltip";
import type { LeaderboardRow } from "@/lib/data";
import { formatPrice, formatScore } from "@/lib/format";
import type { RankScope } from "@/lib/index";
import type { Benchmark } from "@/lib/schema";
import { modelFragment, type ViewMode } from "@/lib/urlState";
import {
  isActiveSortColumn,
  nextDirectionFor,
  type SortColumn,
  type SortState,
} from "@/lib/useSort";

const compactBenchmarkLabels: Record<string, string> = {
  "gpqa-diamond": "GPQA",
  hle: "HLE",
  "aa-lcr": "AA-LCR",
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
  view: ViewMode;
  minimumCoverageCount: number;
  percentBenchmarkCount: number;
  onSort: (column: SortColumn) => void;
  onToggleDetails: (modelId: string) => void;
  onClearFilters: () => void;
};

export function LeaderboardTable({
  rows,
  category,
  allBenchmarks,
  visibleBenchmarks,
  bestScores,
  sort,
  expandedModelId,
  view,
  minimumCoverageCount,
  percentBenchmarkCount,
  onSort,
  onToggleDetails,
  onClearFilters,
}: LeaderboardTableProps) {
  const [hasHorizontalScrollOffset, setHasHorizontalScrollOffset] =
    useState(false);
  const isProfile = view === "profile";
  const showIndexColumn = isProfile || visibleBenchmarks.length !== 1;
  const columnCount =
    3 +
    Number(showIndexColumn) +
    (isProfile ? 1 : visibleBenchmarks.length);
  const isSparse = visibleBenchmarks.length <= 2;
  const tableStyle = {
    "--benchmark-count": visibleBenchmarks.length,
  } as CSSProperties;
  const scopeLabel =
    category === "overall"
      ? "Overall"
      : `${category.charAt(0).toUpperCase()}${category.slice(1)}`;

  const indexTooltip = (
    <Tooltip
      label={`${scopeLabel} Index`}
      description={
        <>
          The equal-weight mean of a model&apos;s scores across the benchmarks
          on this tab. No weighting, no Elo, no adjustments.
        </>
      }
      meta={
        <>
          A model is ranked only once it has measured scores on at least 60% of
          the tab&apos;s benchmarks — currently {minimumCoverageCount} of{" "}
          {percentBenchmarkCount} on Overall. Gaps below that bar are never
          filled; gaps above it are estimated at the model&apos;s own standing
          and marked <em>est.</em>
        </>
      }
      sourceUrl="/methodology"
      sourceLabel="Full methodology"
    />
  );

  return (
    <>
      {!isProfile ? (
        <p className="scroll-hint" id="board-scroll-instructions">
          Scroll for benchmarks · Model column stays pinned · Switch to Profile
          to fit every column
        </p>
      ) : null}
      <div
        className={`board-scroll${hasHorizontalScrollOffset ? " is-scrolled" : ""}`}
        role="region"
        tabIndex={0}
        // Not aria-labelledby the page heading: the enclosing <section> already
        // uses it, and two nested landmarks sharing one name is ambiguous to
        // anyone navigating by landmark.
        aria-label={`${scopeLabel} leaderboard, scrollable table`}
        aria-describedby={
          isProfile ? undefined : "board-scroll-instructions"
        }
        onScroll={(event) => {
          const isScrolled = event.currentTarget.scrollLeft > 0;
          setHasHorizontalScrollOffset((current) =>
            current === isScrolled ? current : isScrolled,
          );
        }}
      >
        <table
          className="board"
          style={tableStyle}
          data-view={isProfile ? "profile" : "table"}
          data-sparse={isSparse ? "true" : undefined}
        >
          <caption className="sr-only">
            Frontier language models ranked by the LM Board Index. Activate a
            column heading to sort, or a model name to open its record.
          </caption>
          <thead>
            <tr>
              <SortableHeader
                column={{ kind: "rank" }}
                label="Rank"
                sort={sort}
                onSort={onSort}
                className="rank-column"
              >
                <span aria-hidden="true">#</span>
              </SortableHeader>
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
                  tooltip={indexTooltip}
                >
                  {category === "overall" ? "Index" : `${scopeLabel} Index`}
                </SortableHeader>
              ) : null}
              {isProfile ? (
                <th scope="col" className="spark-column">
                  <div className="column-header-controls">
                    <span>Scores</span>
                    <Tooltip
                      label="Score profile"
                      description={
                        <>
                          One bar per benchmark, in tab order. Bar height is the
                          score; its shade is the model&apos;s standing within
                          that benchmark&apos;s own spread of results.
                        </>
                      }
                      meta="Switch to the Table projection for every number, with its source."
                    />
                  </div>
                </th>
              ) : (
                visibleBenchmarks.map((benchmark) => (
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
                        meta={`${benchmark.unit === "percent" ? "Percent score on a 0–100 scale" : "Numeric benchmark score"}. Per-model evaluation settings are in each model's record.`}
                        sourceUrl={benchmark.sourceUrl}
                      />
                    }
                  >
                    <span aria-hidden="true">
                      {compactBenchmarkLabels[benchmark.id] ?? benchmark.name}
                    </span>
                  </SortableHeader>
                ))
              )}
              <SortableHeader
                column={{ kind: "price" }}
                label="input and output price per million tokens"
                sort={sort}
                onSort={onSort}
                className="price-column"
                tooltip={
                  <Tooltip
                    label="Price"
                    description="Input and output price in USD per million tokens, at the provider's current uncached base rate."
                    meta="Sorting uses the input price first, then output. Models with no first-party listed price show a dash rather than a zero."
                  />
                }
              >
                <>
                  Price
                  <span className="header-note"> in / out</span>
                </>
              </SortableHeader>
            </tr>
          </thead>
          <tbody className="stagger">
            {rows.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={columnCount}>
                  <strong>No models match these filters.</strong>
                  <span>Try a different search, or start over.</span>
                  <button type="button" className="btn" onClick={onClearFilters}>
                    Clear all filters
                  </button>
                </td>
              </tr>
            ) : null}
            {rows.map((row, rowIndex) => {
              const expanded = expandedModelId === row.model.id;
              const activeScope = row.scopes[category];
              const modelLabel = row.reasoningEffort
                ? `${row.model.name} (${row.reasoningEffort})`
                : row.model.name;
              const rowStyle = { "--i": rowIndex } as CSSProperties;

              return (
                <Fragment key={row.model.id}>
                  <tr
                    id={modelFragment(row.model.name)}
                    style={rowStyle}
                    className={[
                      "model-row",
                      expanded ? "is-expanded" : "",
                      activeScope.rank !== null && activeScope.rank <= 3
                        ? "is-podium"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td className="rank-cell">
                      {activeScope.rank === null ? (
                        <span className="missing-value">—</span>
                      ) : (
                        activeScope.rank
                      )}
                    </td>
                    {/* The row is no longer a click target: a whole-row onClick
                        made every cell expand the panel, blocked text
                        selection, and had no keyboard equivalent. The
                        disclosure button is now the only trigger. */}
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
                          onClick={() => onToggleDetails(row.model.id)}
                        >
                          <span className="disclosure-icon" aria-hidden="true">
                            <ChevronRightIcon />
                          </span>
                          <span className="model-identification">
                            <span className="model-name">
                              {row.model.name}
                            </span>
                            <span className="model-lab">{row.model.lab}</span>
                          </span>
                        </button>
                        {row.reasoningEffortLabel ? (
                          <Badge
                            tone="neutral"
                            title={row.reasoningEffort ?? undefined}
                          >
                            {row.reasoningEffortLabel}
                          </Badge>
                        ) : null}
                        {row.model.openWeights ? (
                          <Badge tone="pos">Open</Badge>
                        ) : null}
                      </div>
                    </th>
                    {showIndexColumn ? (
                      <td className="numeric-cell index-cell">
                        {activeScope.index === null ? (
                          <Tooltip
                            label="Not enough coverage to rank"
                            description={
                              <>
                                This model has measured scores on{" "}
                                {activeScope.coverageCount} of{" "}
                                {activeScope.coverageTotal} benchmarks on this
                                tab. An Index needs at least 60%.
                              </>
                            }
                            meta="Every score it does have is still shown and still sortable. Missing results are never counted as zero."
                            sourceUrl="/methodology"
                            sourceLabel="Why the rule exists"
                            triggerClassName="insufficient-label"
                            triggerLabel={`Why ${row.model.name} is unranked`}
                            triggerContent={<>Insufficient data</>}
                          />
                        ) : (
                          <span className="index-value-line">
                            <span>{formatScore(activeScope.index)}</span>
                            {activeScope.estimatedCount > 0 ? (
                              <Badge
                                tone="warn"
                                title={`${activeScope.estimatedCount} benchmark${activeScope.estimatedCount === 1 ? "" : "s"} estimated at this model's own standing`}
                              >
                                {activeScope.estimatedCount} est.
                              </Badge>
                            ) : null}
                          </span>
                        )}
                      </td>
                    ) : null}
                    {isProfile ? (
                      <ScoreSpark row={row} benchmarks={visibleBenchmarks} />
                    ) : (
                      visibleBenchmarks.map((benchmark) => (
                        <ScoreCell
                          key={benchmark.id}
                          score={row.scoresByBenchmark[benchmark.id]}
                          unit={benchmark.unit}
                          ramp={row.rampByBenchmark[benchmark.id]}
                          benchmarkName={benchmark.name}
                          isBest={
                            row.scoresByBenchmark[benchmark.id]?.value ===
                            bestScores[benchmark.id]
                          }
                        />
                      ))
                    )}
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
