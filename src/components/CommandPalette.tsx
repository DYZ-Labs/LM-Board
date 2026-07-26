"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SearchIcon } from "@/components/Icon";
import type { LeaderboardRow } from "@/lib/data";
import type { Benchmark } from "@/lib/schema";

const MAX_RESULTS = 8;

type Entry = {
  id: string;
  kind: "Model" | "Benchmark" | "View";
  label: string;
  detail: string;
  href: string;
};

type CommandPaletteProps = {
  rows: LeaderboardRow[];
  benchmarks: Benchmark[];
};

export function CommandPalette({ rows, benchmarks }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const entries = useMemo<Entry[]>(
    () => [
      ...rows.map((row) => ({
        id: `model-${row.model.id}`,
        kind: "Model" as const,
        label: row.model.name,
        detail: row.model.lab,
        href: `/model/${row.model.id}`,
      })),
      ...benchmarks.map((benchmark) => ({
        id: `bench-${benchmark.id}`,
        kind: "Benchmark" as const,
        label: benchmark.name,
        detail: benchmark.category,
        href: `/methodology#methodology`,
      })),
      {
        id: "view-compare",
        kind: "View" as const,
        label: "Compare models",
        detail: "Head to head",
        href: "/compare",
      },
      {
        id: "view-methodology",
        kind: "View" as const,
        label: "Methodology",
        detail: "How the Index works",
        href: "/methodology",
      },
    ],
    [benchmarks, rows],
  );

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en");
    if (!normalized) return entries.slice(0, MAX_RESULTS);

    return entries
      .filter((entry) =>
        `${entry.label} ${entry.detail}`
          .toLocaleLowerCase("en")
          .includes(normalized),
      )
      .slice(0, MAX_RESULTS);
  }, [entries, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    returnFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const typingInField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        returnFocusRef.current = document.activeElement as HTMLElement;
        setOpen(true);
        return;
      }

      // "/" is a convention, but only when it is not being typed into a field.
      if (event.key === "/" && !typingInField && !open) {
        event.preventDefault();
        returnFocusRef.current = document.activeElement as HTMLElement;
        setOpen(true);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function handleInputKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => (current + 1) % Math.max(1, results.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(
          (current) =>
            (current - 1 + Math.max(1, results.length)) %
            Math.max(1, results.length),
        );
        break;
      case "Enter": {
        event.preventDefault();
        const entry = results[active];
        if (entry) {
          close();
          router.push(entry.href);
        }
        break;
      }
      default:
        break;
    }
  }

  return (
    <div
      className="palette-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      {/* A modal in the ARIA sense: focus is held by the single input, and
          Escape or a backdrop press returns it to wherever it came from. */}
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search LM Board"
      >
        <div className="palette-input">
          <SearchIcon size={17} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search models, benchmarks, views…"
            aria-label="Search models, benchmarks and views"
            aria-controls="palette-results"
            aria-activedescendant={
              results[active] ? `palette-${results[active].id}` : undefined
            }
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
        </div>
        {results.length > 0 ? (
          <ul className="palette-results" id="palette-results" role="listbox">
            {results.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  id={`palette-${entry.id}`}
                  className="palette-item"
                  role="option"
                  aria-selected={index === active}
                  tabIndex={-1}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => {
                    close();
                    router.push(entry.href);
                  }}
                >
                  <span>
                    {entry.label}{" "}
                    <span className="text-tertiary">{entry.detail}</span>
                  </span>
                  <span className="kind">{entry.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="palette-empty">Nothing matches “{query}”.</p>
        )}
      </div>
    </div>
  );
}
