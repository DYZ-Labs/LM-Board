"use client";

import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { SearchIcon } from "@/components/Icon";
import type { CommandPalettePayload } from "@/lib/commandPalette";
import {
  compareMatches,
  scoreTarget,
  tokenizeQuery,
  type MatchRange,
  type SearchTarget,
} from "@/lib/search";
import { trackEvent } from "@/lib/track";

import "@/styles/palette.css";

const MAX_RESULTS = 8;
const TOP_MODELS = 6;

const GROUP_ORDER = ["model", "benchmark", "go"] as const;
type Kind = (typeof GROUP_ORDER)[number];

const GROUP_LABEL: Record<Kind, string> = {
  model: "Models",
  benchmark: "Benchmarks",
  go: "Go to",
};

type Entry = {
  id: string;
  kind: Kind;
  detail: string;
  href: string;
  /** Standing on the board, and the tie-break for equally-good matches. */
  rank: number | null;
  target: SearchTarget;
};

type Result = Entry & { ranges: MatchRange[] };

type CommandPaletteProps = {
  payload: CommandPalettePayload;
  initialOpen?: boolean;
  initialReturnFocus?: HTMLElement | null;
};

export function buildPaletteEntries(
  payload: CommandPalettePayload,
): Entry[] {
  const [models, benchmarks] = payload;

  return [
    ...models.map(([id, name, lab, rank]) => ({
      id: `model-${id}`,
      kind: "model" as const,
      detail: lab,
      href: `/model/${id}`,
      rank,
      target: { id, name, lab },
    })),
    ...benchmarks.map(([id, name, category]) => ({
      id: `bench-${id}`,
      kind: "benchmark" as const,
      detail: category,
      href: `/methodology#benchmark-${id}`,
      rank: null,
      target: {
        name,
        lab: category,
        id,
      },
    })),
    {
      id: "view-value",
      kind: "go" as const,
      detail: "Performance for the price",
      href: "/value",
      rank: null,
      target: {
        name: "Find the best model for your budget",
        lab: "",
        id: "value",
      },
    },
    {
      id: "view-compare",
      kind: "go" as const,
      detail: "Head to head",
      href: "/compare",
      rank: null,
      target: { name: "Compare models", lab: "", id: "compare" },
    },
    {
      id: "view-methodology",
      kind: "go" as const,
      detail: "How the Index works",
      href: "/methodology",
      rank: null,
      target: { name: "Methodology", lab: "", id: "methodology" },
    },
  ];
}

/** Splits a label so matched spans can carry weight instead of colour. */
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

export const CommandPalette = memo(function CommandPalette({
  payload,
  initialOpen = false,
  initialReturnFocus = null,
}: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(initialReturnFocus);

  const entries = useMemo<Entry[]>(
    () => buildPaletteEntries(payload),
    [payload],
  );

  /**
   * Matches before the cap, so the footer can say how many were left out. The
   * old palette silently truncated at eight with no signal, and ranked by data
   * file order — which put Claude Opus 5, the board's #1, sixth under "opus".
   */
  const matches = useMemo<Result[]>(() => {
    if (tokenizeQuery(query).length === 0) {
      // An unfiltered palette used to open on eight consecutive OpenAI models
      // under no heading, which reads as an editorial shortlist. Rank order
      // under a label says what it actually is.
      return entries
        .filter((entry) => entry.kind === "model" && entry.rank !== null)
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
        .slice(0, TOP_MODELS)
        .map((entry) => ({ ...entry, ranges: [] }));
    }

    return entries
      .map((entry) => ({ ...entry, ...scoreTarget(query, entry.target) }))
      .filter((entry) => entry.score > 0)
      .sort(compareMatches);
  }, [entries, query]);

  const results = useMemo(() => matches.slice(0, MAX_RESULTS), [matches]);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((kind) => ({
        kind,
        items: results
          .map((entry, index) => ({ entry, index }))
          .filter((item) => item.entry.kind === kind),
      })).filter((group) => group.items.length > 0),
    [results],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    returnFocusRef.current?.focus();
  }, []);

  const go = useCallback(
    (entry: Result) => {
      trackEvent("palette_navigate", {
        kind: entry.kind,
        query: query.trim().length,
      });
      close();
      router.push(entry.href);
    },
    [close, query, router],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const typingInField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        // A toggle, so the shortcut that opened it also closes it. Capturing
        // return focus again while open would point it at the palette's own
        // input and strand focus in a dismissed dialog.
        if (open) {
          close();
          return;
        }

        returnFocusRef.current = document.activeElement as HTMLElement;
        setOpen(true);
        return;
      }

      // Escape belongs to the document, not the input: with the panel open and
      // focus anywhere else, an input-scoped handler never fires.
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
        return;
      }

      // "/" is the near-universal convention for the search a page already
      // has, not for a second one stacked on top of it.
      if (event.key === "/" && !typingInField && !open) {
        const field = document.querySelector<HTMLInputElement>(
          ".command-row .field input",
        );
        if (!field) return;

        event.preventDefault();
        field.focus();
        field.select();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;

    inputRef.current?.focus();

    // Restored rather than cleared: another owner may legitimately be holding
    // the page unscrollable, and clearing would silently take that away.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "Tab":
        // The combobox pattern leaves exactly one tabbable node inside the
        // dialog, so holding Tab is the whole trap. Without it six tabs walked
        // out to the masthead links behind the backdrop.
        event.preventDefault();
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
        if (entry) go(entry);
        break;
      }
      default:
        break;
    }
  }

  const listboxId = "palette-results";
  const hasResults = results.length > 0;

  return (
    <div
      className="palette-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search LM Board"
        onKeyDown={handleKeyDown}
      >
        <div className="palette-input">
          <SearchIcon size={17} />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            value={query}
            placeholder="Search models, e.g. GPT-5, Anthropic"
            aria-label="Search models, benchmarks and views"
            aria-expanded={hasResults}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={
              results[active] ? `palette-${results[active].id}` : undefined
            }
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {hasResults ? (
          <div
            className="palette-results"
            id={listboxId}
            role="listbox"
            aria-label="Search results"
          >
            {groups.map((group) => {
              const label = query.trim() ? GROUP_LABEL[group.kind] : "Top models";

              return (
              <div
                className="palette-group"
                key={group.kind}
                role="group"
                aria-label={label}
              >
                <p className="menu-label" aria-hidden="true">
                  {label}
                </p>
                {group.items.map(({ entry, index }) => (
                  <div
                    key={entry.id}
                    id={`palette-${entry.id}`}
                    className="palette-item"
                    role="option"
                    aria-selected={index === active}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => go(entry)}
                  >
                    <span>
                      {highlight(entry.target.name, entry.ranges)}{" "}
                      <span className="palette-detail">{entry.detail}</span>
                    </span>
                    {entry.rank ? (
                      <span className="palette-rank num">#{entry.rank}</span>
                    ) : null}
                  </div>
                ))}
              </div>
              );
            })}
          </div>
        ) : (
          <p className="palette-empty">
            Nothing matches “{query}”. Try a lab — Anthropic, Google, Moonshot.
          </p>
        )}
        <p className="palette-foot">
          <span>
            <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open <kbd>esc</kbd> close
          </span>
          {matches.length > results.length ? (
            <span>{matches.length} results</span>
          ) : null}
        </p>
      </div>
    </div>
  );
});
