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
import { ChevronRightIcon, CloseIcon, ExternalIcon } from "@/components/Icon";
import {
  ScoreCell,
  scoreHost,
  type ScoreInspection,
} from "@/components/ScoreCell";
import { ScoreSpark } from "@/components/ScoreSpark";
import { Tooltip } from "@/components/Tooltip";
import type { LeaderboardClientRow } from "@/lib/data";
import { formatDate, formatPrice, formatScore } from "@/lib/format";
import type { RankScope } from "@/lib/index";
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
  "terminal-bench-v2-1": "T-Bench 2.1",
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLTableSectionElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [hasHorizontalScrollOffset, setHasHorizontalScrollOffset] =
    useState(false);
  // The card layout clips the header row to 1x1 rather than `display: none`,
  // so the column names keep naming their cells. Its controls do not survive
  // that: they were focusable, invisible and unhittable at once — seven tab
  // stops at 390px that landed a keyboard user on nothing.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  // A scroll region is a landmark and a tab stop. At four of the five widths
  // this board is used at the table fits, so declaring one unconditionally
  // announced a scrollable region that cannot scroll and put a focus stop in
  // front of every keyboard user for nothing.
  const [overflows, setOverflows] = useState(false);
  const [inspectedScore, setInspectedScore] =
    useState<ScoreInspection | null>(null);
  const [activeCellId, setActiveCellId] = useState<string | undefined>();
  const activeCellIdRef = useRef<string | undefined>(undefined);
  const activeCellRef = useRef<HTMLElement | null>(null);
  const gridMatrixRef = useRef<HTMLElement[][]>([]);
  const [detailPhases, setDetailPhases] = useState<
    Record<string, DetailPhase>
  >({});
  const scoreTriggerRef = useRef<HTMLAnchorElement | null>(null);
  const scoreInspectorRef = useRef<HTMLElement | null>(null);
  const scoreReturnFocusRef = useRef<HTMLElement | null>(null);
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
  const mobileSortOptions: {
    value: string;
    label: string;
    column: SortColumn;
  }[] = [
    { value: "rank", label: "Rank", column: { kind: "rank" } },
    { value: "model", label: "Model", column: { kind: "model" } },
    {
      value: "index",
      label: `${scopeLabel} Index`,
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

    // In reduced-motion mode there is no intermediate visual state, so the
    // accessibility tree and DOM follow the URL state immediately too.
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
    const frame = window.requestAnimationFrame(() => {
      setDetailPhases((current) =>
        current[expandedModelId] === "opening"
          ? { ...current, [expandedModelId]: "open" }
          : current,
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expandedModelId, rows]);

  const completeDetailExit = useCallback((modelId: string) => {
    setDetailPhases((current) => {
      if (current[modelId] !== "closing") return current;
      const next = { ...current };
      delete next[modelId];
      return next;
    });
  }, []);

  const closeScoreInspector = useCallback(
    ({ restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
      setInspectedScore(null);
      if (restoreFocus) {
        const returnFocus =
          scoreReturnFocusRef.current ?? scoreTriggerRef.current;
        window.requestAnimationFrame(() => returnFocus?.focus());
      }
      scoreReturnFocusRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!inspectedScore) return;

    const frame = window.requestAnimationFrame(() => {
      scoreInspectorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inspectedScore]);

  useEffect(() => {
    if (!inspectedScore) return;

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeScoreInspector();
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closeScoreInspector, inspectedScore]);

  useEffect(() => {
    if (
      inspectedScore &&
      !rows.some((row) => row.model.id === inspectedScore.modelId)
    ) {
      closeScoreInspector({ restoreFocus: false });
    }
  }, [closeScoreInspector, inspectedScore, rows]);

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
        if (inspectedScore) closeScoreInspector();
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

  // The table's own box, not the scroller's `scrollWidth`: under `overflow-x:
  // clip` the scroller has no scrolling box to report, and clip is the default
  // now that the header row has to stick to the viewport.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;

    function measure() {
      if (!scroller) return;
      const table = scroller.firstElementChild;
      if (!table) return;

      const wider =
        table.getBoundingClientRect().width > scroller.clientWidth + 1;
      setOverflows((current) => (current === wider ? current : wider));
    }

    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);

    return () => observer.disconnect();
  }, []);

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
      {/* Present in both projections, and not only because each one describes
          itself differently: the server always renders `table` and narrow
          viewports flip to `profile` on mount, so an element that exists in one
          and not the other shifts everything below the board after hydration.
          Off the page because it is a description, not a caption — sighted
          readers get the pinned column's shadow, which appears exactly when
          sideways scrolling is real. */}
      <p className="sr-only" id="board-scroll-instructions">
        {isProfile
          ? `${visibleBenchmarks.length} benchmark bars, each scaled to that benchmark's measured range. Open the benchmark profile for the complete evidence table.`
          : `${columnCount} columns. Rank and model stay pinned while the board scrolls. Use arrow keys to move through cells, Enter to activate the primary action, and F2 then Tab to reach every action in the current cell. Escape returns to the grid.`}
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
      <div
        ref={scrollRef}
        className={`board-scroll${hasHorizontalScrollOffset ? " is-scrolled" : ""}`}
        {...(overflows
          ? {
              role: "region",
              // Not aria-labelledby the page heading: the enclosing <section>
              // already uses it, and two nested landmarks sharing one name is
              // ambiguous to anyone navigating by landmark.
              "aria-label": `${scopeLabel} leaderboard`,
              "aria-describedby": "board-scroll-instructions",
            }
          : {})}
        onScroll={(event) => {
          const isScrolled = event.currentTarget.scrollLeft > 0;
          setHasHorizontalScrollOffset((current) =>
            current === isScrolled ? current : isScrolled,
          );
        }}
      >
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
            Models ranked by {scopeLabel} Index. Sort with a column header; open
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
                  label={`${scopeLabel} index`}
                  sort={sort}
                  onSort={onSort}
                  interactive={!headerCollapsed}
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
                        {row.model.openWeights ? (
                          <Badge tone="pos">Open</Badge>
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
                            {/* Neutral, not warn: an estimate is a
                                methodological fact, and amber is reserved for
                                vendor-reported provenance. */}
                            {activeScope.estimatedCount > 0 ? (
                              <Badge
                                tone="neutral"
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
                          modelId={row.model.id}
                          modelName={modelLabel}
                          benchmarkId={benchmark.id}
                          benchmarkName={benchmark.name}
                          domain={benchmarkDomains[benchmark.id]}
                          featuredOnMobile={
                            sort.column.kind === "benchmark" &&
                            sort.column.id === benchmark.id
                          }
                          active={
                            inspectedScore?.id ===
                            `${row.model.id}-${benchmark.id}`
                          }
                          onInspect={(inspection, trigger) => {
                            scoreTriggerRef.current = trigger;
                            const activeElement = document.activeElement;
                            scoreReturnFocusRef.current =
                              activeElement instanceof HTMLElement &&
                              activeElement !== document.body
                                ? activeElement
                                : trigger;
                            setInspectedScore(inspection);
                          }}
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
      {inspectedScore ? (
        <aside
          ref={scoreInspectorRef}
          className="score-inspector"
          id="score-inspector"
          role="dialog"
          tabIndex={-1}
          aria-modal="false"
          aria-labelledby="score-inspector-title"
        >
          <div className="score-inspector-head">
            <div>
              <p className="section-kicker">Score source</p>
              <h2 id="score-inspector-title">
                {inspectedScore.modelName} · {inspectedScore.benchmarkName}
              </h2>
            </div>
            <button
              type="button"
              className="btn-icon"
              aria-label="Close score source"
              onClick={() => closeScoreInspector()}
            >
              <CloseIcon />
            </button>
          </div>
          <p className="score-inspector-value num">
            {formatScore(inspectedScore.score.value)}
            {inspectedScore.isBest ? (
              <span> Best measured score in this column</span>
            ) : null}
          </p>
          <dl>
            <div>
              <dt>Source</dt>
              <dd>{scoreHost(inspectedScore.score.source.url)}</dd>
            </div>
            <div>
              <dt>Retrieved</dt>
              <dd>{formatDate(inspectedScore.score.source.retrieved)}</dd>
            </div>
            <div>
              <dt>Measurement</dt>
              <dd>
                {inspectedScore.score.selfReported
                  ? "Vendor-reported"
                  : "Published by Artificial Analysis"}
              </dd>
            </div>
          </dl>
          {inspectedScore.score.settings ? (
            <p className="score-inspector-settings">
              <strong>Settings</strong>
              {inspectedScore.score.settings}
            </p>
          ) : null}
          <div className="score-inspector-actions">
            <a
              className="btn btn-primary link-external"
              href={inspectedScore.score.source.url}
              target="_blank"
              rel="noreferrer"
            >
              Open source <ExternalIcon className="ext" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <Link
              className="btn"
              href={`/model/${inspectedScore.modelId}#benchmark-${inspectedScore.benchmarkId}`}
              prefetch={false}
            >
              Open model evidence
            </Link>
          </div>
        </aside>
      ) : null}
    </>
  );
}
