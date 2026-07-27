"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { CloseIcon, SearchIcon } from "@/components/Icon";
import type {
  ComparePayload,
  CompareRow,
} from "@/lib/compare";
import { expandComparePayload } from "@/lib/compare";
import { formatDate, formatPrice, formatScore } from "@/lib/format";
import { scoreTarget, type MatchRange } from "@/lib/search";
import { MAX_COMPARE, compareFromUrl } from "@/lib/urlState";

type CompareGridProps = {
  payload: ComparePayload;
};

/**
 * The grid's fixed rows, ahead of one row per benchmark. Declared here so the
 * skeleton below is built from the same list as the grid itself and cannot end
 * up a different height than the thing it is standing in for.
 */
const FIXED_ROW_LABELS = [
  "LM Index",
  "Released",
  "Price per 1M tokens",
  "Weights",
] as const;

/** Placeholder column count: the midpoint of the 1-4 a shared link may carry. */
const SKELETON_COLUMNS = 2;

function highlight(label: string, ranges: MatchRange[]) {
  if (ranges.length === 0) return label;

  const parts = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(label.slice(cursor, start));
    parts.push(<mark key={start}>{label.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < label.length) parts.push(label.slice(cursor));
  return parts;
}

/**
 * Reads the selection from the query string rather than useSearchParams: under
 * `output: "export"` that hook forces the whole route to client-render behind
 * a Suspense boundary, and the board already uses this pattern.
 */
export function CompareGrid({ payload }: CompareGridProps) {
  const { rows, benchmarks } = useMemo(
    () => expandComparePayload(payload),
    [payload],
  );
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCandidate, setActiveCandidate] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterRemovalRef = useRef<{ modelId: string | null } | null>(null);
  const availableIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows],
  );

  useEffect(() => {
    function read(canonicalize = false) {
      const url = new URL(window.location.href);
      const parsed = compareFromUrl(
        url.searchParams.get("models"),
        availableIds,
      );
      setIds(parsed);
      setReady(true);

      if (canonicalize) {
        const requested = url.searchParams.get("models");
        const canonical = parsed.join(",");
        if (canonical) url.searchParams.set("models", canonical);
        else url.searchParams.delete("models");
        if ((requested ?? "") !== canonical) {
          window.history.replaceState(window.history.state, "", url);
        }
      }
    }

    read(true);
    const restore = () => read(false);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [availableIds]);

  /*
   * The root pre-paint script marks query-bearing /compare links before CSS is
   * evaluated, so their static shell can show the grid-shaped placeholder.
   * Remove that marker in a layout effect only after the URL selection and
   * `ready` have committed together; the next painted frame is then the real
   * grid (or the canonical empty state for a stale link).
   */
  useLayoutEffect(() => {
    if (ready) {
      delete document.documentElement.dataset.comparePending;
    }
  }, [ready]);

  /*
   * Removing a column destroys the activated button. Restore focus after the
   * new column set commits: the model that slid into its place first, then the
   * previous model, and finally the add-model field when no columns remain.
   */
  useLayoutEffect(() => {
    const pending = focusAfterRemovalRef.current;
    if (!pending) return;

    if (pending.modelId) {
      removeButtonRefs.current.get(pending.modelId)?.focus();
    } else {
      searchInputRef.current?.focus();
    }
    focusAfterRemovalRef.current = null;
  }, [ids]);

  function publishIds(nextIds: string[]) {
    setIds(nextIds);
    const url = new URL(window.location.href);
    if (nextIds.length > 0) url.searchParams.set("models", nextIds.join(","));
    else url.searchParams.delete("models");
    window.history.pushState(
      { ...(window.history.state ?? {}), lmboardCompare: true },
      "",
      url,
    );
  }

  const selected = useMemo(
    () =>
      ids
        .map((id) => rowsById.get(id))
        .filter((row): row is CompareRow => row != null),
    [ids, rowsById],
  );

  const candidates = useMemo(() => {
    if (!query.trim()) return [];

    return rows
      .filter((row) => !ids.includes(row.id))
      .map((row) => ({ row, ...scoreTarget(query, row) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          (right.row.overallIndex ?? -1) -
            (left.row.overallIndex ?? -1) ||
          left.row.name.localeCompare(right.row.name, "en", {
            numeric: true,
            sensitivity: "base",
          }),
      )
      .slice(0, 6);
  }, [ids, query, rows]);

  const leaders = useMemo(() => {
    const best: Record<string, number> = {};

    for (const benchmark of benchmarks) {
      const values = selected
        .map((row) => row.scoresByBenchmark[benchmark.id]?.value)
        .filter((value): value is number => value != null);

      if (values.length > 1) best[benchmark.id] = Math.max(...values);
    }

    const indexes = selected
      .map((row) => row.overallIndex)
      .filter((value): value is number => value != null);
    if (indexes.length > 1) best.__index = Math.max(...indexes);

    return best;
  }, [benchmarks, selected]);
  const quickAdds = useMemo(
    () => rows.filter((row) => !ids.includes(row.id)).slice(0, 3),
    [ids, rows],
  );

  function add(id: string) {
    const nextIds =
      ids.includes(id) || ids.length >= MAX_COMPARE ? ids : [...ids, id];
    if (nextIds !== ids) publishIds(nextIds);
    setQuery("");
    setActiveCandidate(0);
  }

  function remove(id: string) {
    const removedIndex = ids.indexOf(id);
    const nextIds = ids.filter((entry) => entry !== id);
    focusAfterRemovalRef.current = {
      modelId:
        nextIds[Math.min(Math.max(removedIndex, 0), nextIds.length - 1)] ??
        null,
    };
    publishIds(nextIds);
  }

  return (
    <section
      className="longform compare-page"
      id="compare"
      aria-label="Compare models"
    >
      <div className="longform-intro compare-intro">
        <p className="section-kicker">Model comparison</p>
        <h1>Compare AI models</h1>
        <p>
          Compare up to {MAX_COMPARE} models across LM Index, scores, price, and
          weights.
        </p>
      </div>

      <div className="compare-picker">
        <div className="compare-picker-head">
          <div>
            <h2>Choose models</h2>
            <p>Search by model name or provider.</p>
          </div>
          <span className="compare-count">
            {selected.length} / {MAX_COMPARE} selected
          </span>
        </div>
        <div className="row compare-controls">
          <label className={`field search-field${query ? " has-value" : ""}`}>
            <span className="sr-only">Add a model to the comparison</span>
            <SearchIcon />
            <input
              ref={searchInputRef}
              type="search"
              role="combobox"
              value={query}
              aria-expanded={candidates.length > 0}
              aria-autocomplete="list"
              aria-controls="compare-model-options"
              aria-describedby={
                selected.length >= MAX_COMPARE
                  ? "compare-model-limit"
                  : undefined
              }
              aria-activedescendant={
                candidates[activeCandidate]
                  ? `compare-option-${candidates[activeCandidate].row.id}`
                  : undefined
              }
              placeholder={
                selected.length >= MAX_COMPARE
                  ? `Remove one to add another (max ${MAX_COMPARE})`
                  : "Compare models"
              }
              readOnly={selected.length >= MAX_COMPARE}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveCandidate(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && candidates.length > 0) {
                  event.preventDefault();
                  setActiveCandidate(
                    (current) => (current + 1) % candidates.length,
                  );
                } else if (event.key === "ArrowUp" && candidates.length > 0) {
                  event.preventDefault();
                  setActiveCandidate(
                    (current) =>
                      (current - 1 + candidates.length) % candidates.length,
                  );
                } else if (event.key === "Home" && candidates.length > 0) {
                  event.preventDefault();
                  setActiveCandidate(0);
                } else if (event.key === "End" && candidates.length > 0) {
                  event.preventDefault();
                  setActiveCandidate(candidates.length - 1);
                } else if (event.key === "Enter") {
                  const candidate = candidates[activeCandidate];
                  if (candidate) {
                    event.preventDefault();
                    add(candidate.row.id);
                  }
                } else if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                  setActiveCandidate(0);
                }
              }}
            />
          </label>
          {selected.length > 0 ? (
            <CopyLinkButton
              surface="comparison"
              label="Copy share link"
              confirmation="Comparison link copied"
            />
          ) : null}
        </div>
        {selected.length >= MAX_COMPARE ? (
          <p className="sr-only" id="compare-model-limit">
            Maximum of {MAX_COMPARE} models selected. Remove a model before
            adding another.
          </p>
        ) : null}

        {candidates.length > 0 ? (
          <ul
            className="compare-options"
            id="compare-model-options"
            role="listbox"
            aria-label="Models to add"
          >
            {candidates.map(({ row, ranges }, index) => (
              <li
                key={row.id}
                id={`compare-option-${row.id}`}
                role="option"
                aria-selected={index === activeCandidate}
                onPointerEnter={() => setActiveCandidate(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => add(row.id)}
              >
                <span>+ {highlight(row.name, ranges)}</span>
                <span className="text-tertiary">{row.lab}</span>
              </li>
            ))}
          </ul>
        ) : query.trim() && selected.length < MAX_COMPARE ? (
          <p className="compare-no-results" role="status">
            No models match “{query.trim()}”. Try a model name or provider.
          </p>
        ) : selected.length === 0 ? (
          <div className="compare-quick">
            <span>Start with a top-ranked model</span>
            <div>
              {quickAdds.map((row, index) => (
                <button
                  type="button"
                  className={index === 0 ? "btn btn-primary" : "btn"}
                  key={row.id}
                  onClick={() => add(row.id)}
                >
                  + {row.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {ready
          ? selected.length === 0
            ? "No models selected."
            : `${selected.length} ${selected.length === 1 ? "model" : "models"} selected: ${selected.map((row) => row.name).join(", ")}.`
          : ""}
      </p>

      {selected.length === 0 && ready ? null : selected.length === 0 ? (
        /* Static export cannot inspect the URL. It emits both stable initial
          states, with CSS choosing between them from the pre-paint marker:
           clean /compare paints no secondary surface, while ?models= links
           reserve the real grid's shape until parsing commits. */
        <div className="compare-initial">
          <div className="compare-initial-empty" aria-hidden="true" />
          <div
            className="board-shell compare-initial-skeleton"
            aria-busy="true"
          >
            <div className="board-scroll">
              <table className="compare-grid is-skeleton">
                <caption className="sr-only">Loading the comparison</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Attribute</span>
                    </th>
                    {Array.from({ length: SKELETON_COLUMNS }, (_, column) => (
                      <th scope="col" key={column}>
                        <span className="skeleton-bar" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...FIXED_ROW_LABELS,
                    ...benchmarks.map((benchmark) => benchmark.name),
                  ].map((label) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {Array.from(
                        { length: SKELETON_COLUMNS },
                        (_, column) => (
                          <td key={column}>
                            <span className="skeleton-bar" />
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="compare-scroll-cue">Swipe to see more models →</p>
          <div className="board-shell compare-results">
            <div className="board-scroll">
              <table className="compare-grid">
                <caption className="sr-only">
                  Side-by-side comparison of {selected.length} models
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Attribute</span>
                    </th>
                    {selected.map((row) => (
                      <th scope="col" key={row.id}>
                        <span className="compare-model-heading">
                          <Link href={`/model/${row.id}`}>{row.name}</Link>
                          <span>{row.lab}</span>
                        </span>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label={`Remove ${row.name} from the comparison`}
                          ref={(node) => {
                            if (node) {
                              removeButtonRefs.current.set(row.id, node);
                            } else {
                              removeButtonRefs.current.delete(row.id);
                            }
                          }}
                          onClick={() => remove(row.id)}
                        >
                          <CloseIcon />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                <tr>
                  <th scope="row">LM Index</th>
                  {selected.map((row) => {
                    const index = row.overallIndex;
                    return (
                      <td
                        key={row.id}
                        className={
                          index != null && index === leaders.__index
                            ? "is-leader"
                            : undefined
                        }
                        // An em dash is silent, so without a name the cell is
                        // an unexplained blank rather than a stated absence —
                        // and the board never lets a gap read as a nought.
                        aria-label={
                          index == null
                            ? "Not enough coverage to rank"
                            : undefined
                        }
                      >
                        {index == null ? "—" : formatScore(index)}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">Released</th>
                  {selected.map((row) => (
                    <td key={row.id}>{formatDate(row.releaseDate)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Price per 1M tokens</th>
                  {selected.map((row) => (
                    <td
                      key={row.id}
                      aria-label={row.pricing ? undefined : "Not listed"}
                    >
                      {row.pricing ? (
                        <>
                          <span>In ${formatPrice(row.pricing.input)}</span>
                          <span className="compare-price-separator"> · </span>
                          <span>Out ${formatPrice(row.pricing.output)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Weights</th>
                  {selected.map((row) => (
                    <td key={row.id}>
                      {row.openWeights ? "Open" : "Closed"}
                    </td>
                  ))}
                </tr>
                {benchmarks.map((benchmark, index) => (
                  <tr
                    key={benchmark.id}
                    className={
                      index === 0 ? "compare-benchmarks-start" : undefined
                    }
                  >
                    <th scope="row">{benchmark.name}</th>
                    {selected.map((row) => {
                      const score = row.scoresByBenchmark[benchmark.id];
                      return (
                        <td
                          key={row.id}
                          className={`score-cell${
                            score && score.value === leaders[benchmark.id]
                              ? " is-leader"
                              : ""
                          }`}
                          aria-label={score ? undefined : "Not measured"}
                        >
                          {score ? formatScore(score.value) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="compare-note">
            Best score in each row is highlighted. Open a model name for its
            complete evidence record.
          </p>
        </>
      )}
    </section>
  );
}
