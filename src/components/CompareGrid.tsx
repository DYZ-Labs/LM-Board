"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { CloseIcon, SearchIcon } from "@/components/Icon";
import type { LeaderboardRow } from "@/lib/data";
import { formatDate, formatPrice, formatScore } from "@/lib/format";
import type { Benchmark } from "@/lib/schema";
import { MAX_COMPARE, compareFromUrl } from "@/lib/urlState";

type CompareGridProps = {
  rows: LeaderboardRow[];
  benchmarks: Benchmark[];
};

/**
 * Reads the selection from the query string rather than useSearchParams: under
 * `output: "export"` that hook forces the whole route to client-render behind
 * a Suspense boundary, and the board already uses this pattern.
 */
export function CompareGrid({ rows, benchmarks }: CompareGridProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function read() {
      const params = new URLSearchParams(window.location.search);
      setIds(compareFromUrl(params.get("models")));
      setReady(true);
    }

    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const url = new URL(window.location.href);
    if (ids.length > 0) {
      url.searchParams.set("models", ids.join(","));
    } else {
      url.searchParams.delete("models");
    }
    window.history.replaceState(window.history.state, "", url);
  }, [ids, ready]);

  const selected = useMemo(
    () =>
      ids
        .map((id) => rows.find((row) => row.model.id === id))
        .filter((row): row is LeaderboardRow => row != null),
    [ids, rows],
  );

  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en");
    if (!normalized) return [];

    return rows
      .filter(
        (row) =>
          !ids.includes(row.model.id) &&
          `${row.model.name} ${row.model.lab}`
            .toLocaleLowerCase("en")
            .includes(normalized),
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
      .map((row) => row.scopes.overall.index)
      .filter((value): value is number => value != null);
    if (indexes.length > 1) best.__index = Math.max(...indexes);

    return best;
  }, [benchmarks, selected]);

  function add(id: string) {
    setIds((current) =>
      current.includes(id) || current.length >= MAX_COMPARE
        ? current
        : [...current, id],
    );
    setQuery("");
  }

  function remove(id: string) {
    setIds((current) => current.filter((entry) => entry !== id));
  }

  return (
    <section className="longform" id="compare" aria-label="Compare models">
      <div className="longform-intro">
        <h1>Compare</h1>
        <p>
          Put up to {MAX_COMPARE} models side by side. Every number keeps its
          citation, and the resulting URL is shareable.
        </p>
      </div>

      <div className="row" style={{ marginBottom: "var(--s-7)" }}>
        <label className={`field${query ? " has-value" : ""}`}>
          <span className="sr-only">Add a model to the comparison</span>
          <SearchIcon />
          <input
            type="search"
            value={query}
            placeholder={
              selected.length >= MAX_COMPARE
                ? `Remove one to add another (max ${MAX_COMPARE})`
                : "Add a model…"
            }
            disabled={selected.length >= MAX_COMPARE}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {selected.length > 0 ? (
          <CopyLinkButton
            label="Copy comparison"
            confirmation="Comparison link copied"
          />
        ) : null}
      </div>

      {candidates.length > 0 ? (
        <ul
          className="row"
          style={{ listStyle: "none", padding: 0, marginBottom: "var(--s-7)" }}
        >
          {candidates.map((row) => (
            <li key={row.model.id}>
              <button
                type="button"
                className="btn"
                onClick={() => add(row.model.id)}
              >
                + {row.model.name}
                <span className="text-tertiary">{row.model.lab}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected.length === 0 ? (
        <p className="compare-empty">
          {ready
            ? "No models selected yet. Search above, or open a model record and choose Compare."
            : "Loading the comparison…"}
        </p>
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
                    <th scope="col" key={row.model.id}>
                      <Link href={`/model/${row.model.id}`}>
                        {row.model.name}
                      </Link>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Remove ${row.model.name} from the comparison`}
                        onClick={() => remove(row.model.id)}
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
                    const index = row.scopes.overall.index;
                    return (
                      <td
                        key={row.model.id}
                        className={
                          index != null && index === leaders.__index
                            ? "is-leader"
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
                    <td key={row.model.id}>{row.model.lab}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Released</th>
                  {selected.map((row) => (
                    <td key={row.model.id}>
                      {formatDate(row.model.releaseDate)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Price in / out</th>
                  {selected.map((row) => (
                    <td key={row.model.id}>
                      {row.model.pricing
                        ? `$${formatPrice(row.model.pricing.input)} / $${formatPrice(row.model.pricing.output)}`
                        : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Weights</th>
                  {selected.map((row) => (
                    <td key={row.model.id}>
                      {row.model.openWeights ? "Open" : "Closed"}
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
                          key={row.model.id}
                          className={
                            score && score.value === leaders[benchmark.id]
                              ? "is-leader"
                              : undefined
                          }
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
      )}
    </section>
  );
}
