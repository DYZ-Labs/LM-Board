"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { Badge } from "@/components/Badge";
import { DetailPanel } from "@/components/DetailPanel";
import { ChevronRightIcon } from "@/components/Icon";
import { ScoreCell } from "@/components/ScoreCell";
import { ScoreSpark } from "@/components/ScoreSpark";
import { Tooltip } from "@/components/Tooltip";
import type { LeaderboardClientRow } from "@/lib/data";
import { formatPrice, formatScore } from "@/lib/format";
import {
  LM_INDEX_EXPANDED_LABEL,
  LM_INDEX_LABEL,
  type RankScope,
} from "@/lib/index";
import type { ScoreDomain } from "@/lib/ramp";
import { trackEvent } from "@/lib/track";
import type { Benchmark } from "@/lib/schema";
import { modelFragment, type ViewMode } from "@/lib/urlState";
import {
  isActiveSortColumn,
  nextDirectionFor,
  type SortColumn,
  type SortState,
} from "@/lib/useSort";

/* Short forms of the published names, never uppercased: `text-transform` turns
   the tau in τ³-Banking into a capital Tau and prints a benchmark that does not
   exist. */
const compactBenchmarkLabels: Record<string, string> = {
  "gpqa-diamond": "GPQA",
  hle: "HLE",
  "aa-lcr": "AA-LCR",
  ifbench: "IFBench",
  critpt: "CritPt",
  "terminal-bench-v2-1": "T-Bench",
  scicode: "SciCode",
  "tau3-banking": "τ³-Banking",
};

type DetailPhase = "opening" | "open" | "closing";

type SortableHeaderProps = {
  column: SortColumn;
  label: string;
  sort: SortState;
  onSort: (column: SortColumn) => void;
  /** False while the header row is clipped away — see `headerCollapsed`. */
  interactive: boolean;
  children?: ReactNode;
  className?: string;
  tooltip?: ReactNode;
  /** Overrides the noun in "Sort by …" when the column name is too terse. */
  sortLabel?: string;
};

function SortableHeader({
  column,
  label,
  sort,
  onSort,
  interactive,
  children,
  className,
  tooltip,
  sortLabel = label,
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
        {interactive ? (
          <>
            <button
              type="button"
              className="sort-button"
              onClick={() => onSort(column)}
              aria-label={`Sort by ${sortLabel} ${nextDirection === "asc" ? "ascending" : "descending"}`}
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
          </>
        ) : (
          /* Just the name the column lends its cells. The compact form and the
             `#` glyph are aria-hidden, so the full label is what is left. */
          <span>{label}</span>
        )}
      </div>
    </th>
  );
}

function sortColumnValue(column: SortColumn) {
  return column.kind === "benchmark"
    ? `benchmark:${column.id}`
    : column.kind;
}

type LeaderboardTableProps = {
  rows: LeaderboardClientRow[];
  category: RankScope;
  allBenchmarks: Benchmark[];
  visibleBenchmarks: Benchmark[];
  benchmarkDomains: Record<string, ScoreDomain>;
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
  benchmarkDomains,
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
  const headRef = useRef<HTMLTableSectionElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  // The card layout clips the header row to 1x1 rather than `display: none`,
  // so the column names keep naming their cells. Its controls do not survive
  // that: they were focusable, invisible and unhittable at once — seven tab
  // stops at 390px that landed a keyboard user on nothing.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [activeCellId, setActiveCellId] = useState<string | undefined>();
  const activeCellIdRef = useRef<string | undefined>(undefined);
  const activeCellRef = useRef<HTMLElement | null>(null);
  const gridMatrixRef = useRef<HTMLElement[][]>([]);
  const [detailPhases, setDetailPhases] = useState<
    Record<string, DetailPhase>
  >({});
  const isProfile = view === "profile";
  // A single measured benchmark makes its category Index redundant, but an
  // estimated Index still needs its own numeric cell because the score is absent.
  const showIndexColumn =
    isProfile ||
    visibleBenchmarks.length !== 1 ||
    rows.some((row) => row.scopes[category].estimatedCount > 0);
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
  const indexLabel =
    category === "overall"
      ? LM_INDEX_LABEL
      : `${scopeLabel} Index`;
  const indexExpandedLabel =
    category === "overall" ? LM_INDEX_EXPANDED_LABEL : indexLabel;
  const mobileSortOptions: {
    value: string;
    label: string;
    column: SortColumn;
  }[] = [
    { value: "rank", label: "Rank", column: { kind: "rank" } },
    { value: "model", label: "Model", column: { kind: "model" } },
    {
      value: "index",
      label: indexLabel,
      column: { kind: "index" },
    },
    ...visibleBenchmarks.map((benchmark) => ({
      value: `benchmark:${benchmark.id}`,
      label: benchmark.name,
      column: { kind: "benchmark" as const, id: benchmark.id },
    })),
    {
      value: "price",
      label: "Input price",
      column: { kind: "price" },
    },
  ];
  const nextMobileDirection =
    sort.direction === "asc" ? "descending" : "ascending";
  useEffect(() => {
    const visibleIds = new Set(rows.map((row) => row.model.id));
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let active = true;
    let frame: number | null = null;

    // Defer the state transition out of the effect body so one URL-state
    // synchronization cannot trigger a cascading render. Reduced motion still
    // skips the intermediate visual phase entirely.
    queueMicrotask(() => {
      if (!active) return;
      if (reducedMotion) {
        setDetailPhases(
          expandedModelId && visibleIds.has(expandedModelId)
            ? { [expandedModelId]: "open" }
            : {},
        );
        return;
      }

      setDetailPhases((current) => {
        const next: Record<string, DetailPhase> = {};

        for (const [id, phase] of Object.entries(current)) {
          if (!visibleIds.has(id)) continue;
          next[id] =
            id === expandedModelId
              ? phase === "open"
                ? "open"
                : "opening"
              : "closing";
        }

        if (expandedModelId && visibleIds.has(expandedModelId)) {
          next[expandedModelId] ??= "opening";
        }

        const unchanged =
          Object.keys(current).length === Object.keys(next).length &&
          Object.entries(next).every(([id, phase]) => current[id] === phase);
        return unchanged ? current : next;
      });

      if (!expandedModelId) return;
      frame = window.requestAnimationFrame(() => {
        setDetailPhases((current) =>
          current[expandedModelId] === "opening"
            ? { ...current, [expandedModelId]: "open" }
            : current,
        );
      });
    });

    return () => {
      active = false;
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [expandedModelId, rows]);

  const completeDetailExit = useCallback((modelId: string) => {
    setDetailPhases((current) => {
      if (current[modelId] !== "closing") return current;
      const next = { ...current };
      delete next[modelId];
      return next;
    });
  }, []);

  const gridCells = useCallback(() => {
    const table = tableRef.current;
    if (!table) return [] as HTMLElement[][];

    const selector = headerCollapsed
      ? "tbody > tr.model-row"
      : "thead > tr, tbody > tr.model-row";

    return [...table.querySelectorAll<HTMLTableRowElement>(selector)]
      .map((row) =>
        [...row.children].filter(
          (cell): cell is HTMLElement =>
            cell instanceof HTMLElement &&
            getComputedStyle(cell).display !== "none" &&
            getComputedStyle(cell).visibility !== "hidden",
        ),
      )
      .filter((cells) => cells.length > 0);
  }, [headerCollapsed]);

  const cellControls = useCallback((cell: HTMLElement | undefined) => {
    if (!cell) return [];
    return [
      ...cell.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]",
      ),
    ];
  }, []);

  const leaveCellActions = useCallback(
    (cell: HTMLElement | null, restoreGridFocus = false) => {
      cellControls(cell ?? undefined).forEach((control) => {
        control.tabIndex = -1;
      });
      if (restoreGridFocus) tableRef.current?.focus();
    },
    [cellControls],
  );

  const activateGridCell = useCallback((cell: HTMLElement | undefined) => {
    if (!cell) return;

    activeCellRef.current?.classList.remove("is-grid-active");
    cell.classList.add("is-grid-active");
    activeCellRef.current = cell;
    activeCellIdRef.current = cell.id;
    setActiveCellId(cell.id);
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  useEffect(() => {
    const table = tableRef.current;
    const matrix = gridCells();
    gridMatrixRef.current = matrix;
    const everyCell = table
      ? [
          ...table.querySelectorAll<HTMLElement>(
            "thead > tr > th, tbody > tr.model-row > :is(th, td)",
          ),
        ]
      : [];

    // A viewport transition changes the navigation matrix without replacing
    // the DOM. Remove IDs from the cells that just left it before assigning
    // the new coordinates; otherwise the clipped header and the first body row
    // both own `board-cell-0-*`, and querySelector sends arrow navigation back
    // to the invisible header.
    everyCell.forEach((cell) => {
      cell.removeAttribute("id");
      cell.classList.remove("is-grid-active");
    });

    matrix.forEach((cells, rowIndex) => {
      cells.forEach((cell, columnIndex) => {
        cell.id = `board-cell-${rowIndex}-${columnIndex}`;
        cell
          .querySelectorAll<HTMLElement>("a[href], button, [tabindex]")
          .forEach((control) => {
            control.dataset.nativeTabIndex = control.getAttribute("tabindex") ?? "";
            control.tabIndex = -1;
          });
      });
    });

    const existing = activeCellIdRef.current
      ? matrix
          .flat()
          .find((cell) => cell.id === activeCellIdRef.current)
      : null;
    activateGridCell(existing ?? matrix[0]?.[0]);

    return () => {
      gridMatrixRef.current = [];
      activeCellRef.current = null;
      everyCell.forEach((cell) => {
        cell.removeAttribute("id");
        cell.classList.remove("is-grid-active");
      });
      table
        ?.querySelectorAll<HTMLElement>("[data-native-tab-index]")
        .forEach((control) => {
          const previous = control.dataset.nativeTabIndex;
          if (previous) control.setAttribute("tabindex", previous);
          else control.removeAttribute("tabindex");
          delete control.dataset.nativeTabIndex;
        });
    };
  }, [
    activateGridCell,
    gridCells,
    rows,
    view,
    visibleBenchmarks,
  ]);

  function onGridKeyDown(event: ReactKeyboardEvent<HTMLTableElement>) {
    // F2 hands focus to the native controls inside the active cell. Once there,
    // normal browser semantics win: Tab reaches every action, Enter activates
    // it, and Escape returns to the one grid stop. Without this branch, the
    // header's methodology button and the model record link could never be
    // reached because the grid intentionally removes hundreds of descendants
    // from the page-wide Tab sequence.
    if (event.target !== event.currentTarget) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const cell = (event.target as HTMLElement).closest<HTMLElement>(
          "th, td",
        );
        leaveCellActions(cell, true);
        activateGridCell(cell ?? undefined);
      }
      return;
    }

    // The matrix changes only when rows, projection, visible columns or the
    // responsive header state changes. Reusing the matrix built by the effect
    // avoids hundreds of getComputedStyle calls on every arrow key.
    const matrix = gridMatrixRef.current;
    if (matrix.length === 0) return;

    const active = activeCellRef.current ?? matrix[0]?.[0];
    const rowIndex = matrix.findIndex((row) => row.includes(active!));
    const columnIndex =
      rowIndex >= 0 ? matrix[rowIndex]!.indexOf(active!) : 0;
    let nextRow = Math.max(0, rowIndex);
    let nextColumn = Math.max(0, columnIndex);

    switch (event.key) {
      case "ArrowLeft":
        nextColumn -= 1;
        break;
      case "ArrowRight":
        nextColumn += 1;
        break;
      case "ArrowUp":
        nextRow -= 1;
        break;
      case "ArrowDown":
        nextRow += 1;
        break;
      case "Home":
        if (event.ctrlKey || event.metaKey) nextRow = 0;
        nextColumn = 0;
        break;
      case "End":
        if (event.ctrlKey || event.metaKey) nextRow = matrix.length - 1;
        nextColumn = matrix[Math.min(nextRow, matrix.length - 1)]!.length - 1;
        break;
      case "PageUp":
        nextRow -= 10;
        break;
      case "PageDown":
        nextRow += 10;
        break;
      case "Enter":
      case " ":
        active
          ?.querySelector<HTMLElement>("a[href], button")
          ?.click();
        event.preventDefault();
        return;
      case "F2": {
        const controls = cellControls(active);
        if (controls.length > 0) {
          controls.forEach((control) => {
            control.tabIndex = 0;
          });
          controls[0]?.focus();
          event.preventDefault();
        }
        return;
      }
      case "Escape":
        return;
      default:
        return;
    }

    event.preventDefault();
    nextRow = Math.min(matrix.length - 1, Math.max(0, nextRow));
    nextColumn = Math.min(
      matrix[nextRow]!.length - 1,
      Math.max(0, nextColumn),
    );
    activateGridCell(matrix[nextRow]![nextColumn]);
  }

  // Measured, not matched against the breakpoint that does the clipping: the
  // rule lives in responsive.css and is scoped to one projection, so a copy of
  // its condition here would be a second source of truth that drifts silently.
  // The clipped row is 1px tall and nothing else in this table ever is.
  useEffect(() => {
    const head = headRef.current;
    if (!head || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const collapsed = head.getBoundingClientRect().height <= 1.5;
      setHeaderCollapsed((current) =>
        current === collapsed ? current : collapsed,
      );
    });

    observer.observe(head);

    return () => observer.disconnect();
  }, []);

  const indexTooltip = (
    <Tooltip
      label={indexExpandedLabel}
      description={
        <>
          The equal-weight mean of a model&apos;s scores across the benchmarks
          on this tab. No weighting, no Elo, no adjustments.
        </>
      }
      meta={
        <>
          Overall ranking requires measured scores on at least 60% of the full
          suite — currently {minimumCoverageCount} of {percentBenchmarkCount}.
          Once that broad evidence gate is clear, category gaps may be estimated
          at the model&apos;s measured percentile standing. Missing results are
          never counted as zero.
        </>
      }
      sourceUrl="/methodology"
      sourceLabel="Full methodology"
    />
  );

  return (
    <>
      <p className="sr-only" id="board-grid-instructions">
        {isProfile
          ? `${visibleBenchmarks.length} benchmark bars, each scaled to that benchmark's measured range. Open the benchmark profile for the complete evidence table.`
          : `${columnCount} columns. Use arrow keys to move through cells, Enter to activate the primary action, and F2 then Tab to reach every action in the current cell. Escape returns to the grid.`}
      </p>
      <div className="mobile-sort-controls">
        <label>
          <span>Sort</span>
          <select
            aria-label="Sort leaderboard by"
            value={sortColumnValue(sort.column)}
            onChange={(event) => {
              const option = mobileSortOptions.find(
                (entry) => entry.value === event.currentTarget.value,
              );
              if (option && option.value !== sortColumnValue(sort.column)) {
                onSort(option.column);
              }
            }}
          >
            {mobileSortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mobile-sort-direction">
          <span className="sr-only" id="mobile-sort-direction-state">
            Currently sorted {sort.direction === "asc" ? "ascending" : "descending"}.
          </span>
          <button
            type="button"
            className="btn"
            aria-describedby="mobile-sort-direction-state"
            onClick={() => onSort(sort.column)}
          >
            Sort {nextMobileDirection}{" "}
            <span aria-hidden="true">
              {nextMobileDirection === "ascending" ? "↑" : "↓"}
            </span>
          </button>
        </div>
      </div>
      <div className="board-scroll">
        <table
          ref={tableRef}
          className="board"
          style={tableStyle}
          data-view={isProfile ? "profile" : "table"}
          data-sparse={isSparse ? "true" : undefined}
          role="grid"
          tabIndex={0}
          aria-rowcount={rows.length + 1}
          aria-colcount={columnCount}
          aria-activedescendant={activeCellId}
          aria-describedby="board-grid-instructions"
          onKeyDown={onGridKeyDown}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
              const cell = (event.target as HTMLElement).closest<HTMLElement>(
                "th, td",
              );
              leaveCellActions(cell);
            }
          }}
        >
          <caption className="sr-only">
            Models ranked by {indexExpandedLabel}. Sort with a column header; open
            a model for sources and details.
          </caption>
          <thead ref={headRef}>
            <tr>
              <SortableHeader
                column={{ kind: "rank" }}
                label="Rank"
                sort={sort}
                onSort={onSort}
                interactive={!headerCollapsed}
                className="rank-column"
              >
                <span aria-hidden="true">#</span>
              </SortableHeader>
              <SortableHeader
                column={{ kind: "model" }}
                label="Model"
                sort={sort}
                onSort={onSort}
                interactive={!headerCollapsed}
                className="model-column"
              />
              {showIndexColumn ? (
                <SortableHeader
                  column={{ kind: "index" }}
                  label={indexLabel}
                  sort={sort}
                  onSort={onSort}
                  interactive={!headerCollapsed}
                  className="index-column"
                  tooltip={indexTooltip}
                >
                  {category === "overall" ? (
                    <span title={LM_INDEX_EXPANDED_LABEL}>{LM_INDEX_LABEL}</span>
                  ) : (
                    indexLabel
                  )}
                </SortableHeader>
              ) : null}
              {isProfile ? (
                <th scope="col" className="spark-column">
                  <div className="column-header-controls">
                    <span>Scores</span>
                    {headerCollapsed ? null : (
                      <Tooltip
                        label="Score profile"
                        description={
                          <>
                            One bar per benchmark, in tab order. Both readings
                            are against that benchmark&apos;s own measured
                            range: the height is where the model sits in it, the
                            shade is which fifth of the field it falls in.
                          </>
                        }
                        meta="Open the model record for its complete evidence table, or switch to the Table projection."
                      />
                    )}
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
                    interactive={!headerCollapsed}
                    className={`benchmark-column${benchmark.id === "critpt" ? " is-inset" : ""}`}
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
                label="Price in / out"
                sortLabel="input and output price per million tokens"
                sort={sort}
                onSort={onSort}
                interactive={!headerCollapsed}
                className="price-column"
                tooltip={
                  <Tooltip
                    label="Price in / out"
                    description="Input and output price in USD per million tokens, copied from the provider page linked in the model record."
                    meta="No separate retrieval date is stored. Sorting uses input price first, then output. An unlisted price is a dash, never zero."
                  />
                }
              />
            </tr>
          </thead>
          <tbody>
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
            {rows.map((row) => {
              const expanded = expandedModelId === row.model.id;
              const activeScope = row.scopes[category];
              const modelLabel = row.reasoningEffort
                ? `${row.model.name} (${row.reasoningEffort})`
                : row.model.name;
              const measuredScoreCount = allBenchmarks.reduce(
                (count, benchmark) =>
                  count +
                  Number(row.scoresByBenchmark[benchmark.id] !== null),
                0,
              );

              return (
                <Fragment key={row.model.id}>
                  <tr
                    id={modelFragment(row.model.name)}
                    className={[
                      "model-row",
                      expanded ? "is-expanded" : "",
                      sort.column.kind === "benchmark"
                        ? "has-mobile-sort-score"
                        : "",
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
                          aria-label={`${expanded ? "Hide" : "Show"} details for ${modelLabel}, ${row.model.lab}`}
                          onClick={() => {
                            if (!expanded) {
                              trackEvent("row_expand", { model: row.model.id });
                            }
                            onToggleDetails(row.model.id);
                          }}
                        >
                          <span className="disclosure-icon" aria-hidden="true">
                            <ChevronRightIcon />
                          </span>
                          <span className="sr-only">
                            {expanded ? "Hide" : "Show"} details
                          </span>
                        </button>
                        <span className="model-identification">
                          <Link
                            className="model-name"
                            href={`/model/${row.model.id}`}
                            prefetch={false}
                          >
                            {row.model.name}
                          </Link>
                          <span className="model-lab">{row.model.lab}</span>
                        </span>
                        {row.reasoningEffortLabel ? (
                          <Badge
                            tone="neutral"
                            title={row.reasoningEffort ?? undefined}
                          >
                            {row.reasoningEffortLabel}
                          </Badge>
                        ) : null}
                      </div>
                      <Link
                        className="mobile-evidence-link"
                        href={`/model/${row.model.id}#record-scores`}
                        prefetch={false}
                      >
                        Evidence <span aria-hidden="true">·</span>{" "}
                        {measuredScoreCount} scores
                      </Link>
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
                                tab and does not qualify through the Overall
                                evidence gate.
                              </>
                            }
                            meta="Every score it does have is still shown and sortable. Missing results are never counted as zero, and an incomplete estimate never receives a rank."
                            sourceUrl="/methodology"
                            sourceLabel="Why the rule exists"
                            triggerClassName="insufficient-label"
                            triggerLabel={`Why ${row.model.name} is unranked`}
                            triggerContent={<>Insufficient data</>}
                          />
                        ) : (
                          formatScore(activeScope.index)
                        )}
                      </td>
                    ) : null}
                    {isProfile ? (
                      <ScoreSpark
                        row={row}
                        benchmarks={visibleBenchmarks}
                        domains={benchmarkDomains}
                      />
                    ) : (
                      visibleBenchmarks.map((benchmark) => (
                        <ScoreCell
                          key={benchmark.id}
                          score={row.scoresByBenchmark[benchmark.id]}
                          benchmarkName={benchmark.name}
                          inset={benchmark.id === "critpt"}
                          featuredOnMobile={
                            sort.column.kind === "benchmark" &&
                            sort.column.id === benchmark.id
                          }
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
                  {detailPhases[row.model.id] ? (
                    <DetailPanel
                      row={row}
                      benchmarks={allBenchmarks}
                      colSpan={columnCount}
                      state={detailPhases[row.model.id]}
                      onExitComplete={() => completeDetailExit(row.model.id)}
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
