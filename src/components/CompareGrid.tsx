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
import { trackEvent } from "@/lib/track";
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
  "Overall Index",
  "Provider",
  "Released",
  "Price in / out",
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
 * The provenance sentence above the grid, counted off the grid itself.
 *
 * Before a selection arrives there is nothing to count, so the claim is stated
 * as the guarantee it is; once the columns are up it becomes an assertion about
 * the very cells underneath it, which anyone can check by clicking them.
 */
function citationClaim(linked: number, total: number) {
  if (total === 0) {
    return "Every benchmark score links to the measurement it came from";
  }

  const scale =
    linked === total
      ? total === 1
        ? "The one"
        : `All ${total}`
      : `${linked} of ${total}`;
  // Singular is unreachable from the current dataset — the thinnest model
  // carries six scores — but the sentence is generated, not written, so it has
  // to survive a thinner one arriving.
  const [noun, verb, subject] =
    total === 1
      ? ["score", "links", "it came"]
      : ["scores", "link", "they came"];

  return `${scale} benchmark ${noun} below ${verb} to the measurement ${subject} from`;
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

  /**
   * The intro used to promise that "every number keeps its citation", which the
   * grid falsifies on sight: the Index is derived rather than measured, and the
   * specification rows are a provider's own listing with no retrieval date.
   * Counting what is actually on screen — rather than writing a number down —
   * means a score that ever arrived without a source would rewrite the sentence
   * instead of turning it into a lie.
   */
  const citations = useMemo(() => {
    let total = 0;
    let linked = 0;

    for (const row of selected) {
      for (const benchmark of benchmarks) {
        const score = row.scoresByBenchmark[benchmark.id];
        if (!score) continue;
        total += 1;
        if (score.sourceUrl) linked += 1;
      }
    }

    return { total, linked };
  }, [benchmarks, selected]);

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
    <section className="longform" id="compare" aria-label="Compare models">
      <div className="longform-intro">
        <h1>Compare</h1>
        <p>
          Put up to {MAX_COMPARE} models side by side. The resulting URL is
          shareable.
        </p>
        <p>
          <span className="provenance-claim">
            {citationClaim(citations.linked, citations.total)}
          </span>
          . The Index is derived from those scores; provider, release date,
          price and weights come from the model&apos;s own page and carry no
          retrieval date.
        </p>
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
                : "Add a model…"
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
            label="Copy comparison"
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
          className="row compare-options"
          id="compare-model-options"
          role="listbox"
          aria-label="Models to add"
        >
          {candidates.map(({ row, ranges }, index) => (
            <li
              key={row.id}
              id={`compare-option-${row.id}`}
              className="btn"
              role="option"
              aria-selected={index === activeCandidate}
              onPointerEnter={() => setActiveCandidate(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => add(row.id)}
            >
              + {highlight(row.name, ranges)}
              <span className="text-tertiary">{row.lab}</span>
            </li>
          ))}
        </ul>
      ) : query.trim() && selected.length < MAX_COMPARE ? (
        <p className="compare-empty" role="status">
          No models match “{query.trim()}”. Try a model name or provider.
        </p>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {ready
          ? selected.length === 0
            ? "No models selected."
            : `${selected.length} ${selected.length === 1 ? "model" : "models"} selected: ${selected.map((row) => row.name).join(", ")}.`
          : ""}
      </p>

      {selected.length === 0 && ready ? (
        <p className="compare-empty">
          No models selected yet. Search above, or open a model record and choose
          Compare.
        </p>
      ) : selected.length === 0 ? (
        /* Static export cannot inspect the URL. It emits both stable initial
           states, with CSS choosing between them from the pre-paint marker:
           clean /compare paints the same empty message hydration keeps, while
           ?models= links reserve the real grid's shape until parsing commits. */
        <div className="compare-initial">
          <p className="compare-empty compare-initial-empty">
            No models selected yet. Search above, or open a model record and
            choose Compare.
          </p>
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
        <div className="board-shell">
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
                      <Link href={`/model/${row.id}`}>{row.name}</Link>
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
                  <th scope="row">Overall Index</th>
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
                  <th scope="row">Provider</th>
                  {selected.map((row) => (
                    <td key={row.id}>{row.lab}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Released</th>
                  {selected.map((row) => (
                    <td key={row.id}>{formatDate(row.releaseDate)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Price in / out</th>
                  {selected.map((row) => (
                    <td
                      key={row.id}
                      aria-label={row.pricing ? undefined : "Not listed"}
                    >
                      {row.pricing
                        ? `$${formatPrice(row.pricing.input)} / $${formatPrice(row.pricing.output)}`
                        : "—"}
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
                {benchmarks.map((benchmark) => (
                  <tr key={benchmark.id}>
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
                          {score ? (
                            <a
                              className="score-source"
                              href={score.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-source={benchmark.id}
                              aria-label={`Source for ${row.name} on ${benchmark.name}: ${formatScore(score.value)}, retrieved ${formatDate(score.retrieved)}`}
                              onClick={() =>
                                trackEvent("source_click", {
                                  surface: "comparison",
                                  benchmark: benchmark.id,
                                })
                              }
                            >
                              <span className="score-number">
                                {formatScore(score.value)}
                              </span>
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
