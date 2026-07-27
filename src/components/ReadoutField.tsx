"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import { formatScore } from "@/lib/format";

type FieldEntry = {
  index: number;
  name: string;
  rank: string;
};

type ReadoutFieldProps = {
  /** One compact `rank<TAB>name<TAB>index` record per line. */
  data: string;
};

function parseField(data: string): FieldEntry[] {
  return data.split("\n").flatMap((record) => {
    const firstSeparator = record.indexOf("\t");
    const lastSeparator = record.lastIndexOf("\t");

    if (
      firstSeparator < 0 ||
      lastSeparator <= firstSeparator ||
      lastSeparator === record.length - 1
    ) {
      return [];
    }

    const index = Number(record.slice(lastSeparator + 1));
    if (!Number.isFinite(index)) return [];

    return [
      {
        rank: record.slice(0, firstSeparator) || "—",
        name: record.slice(firstSeparator + 1, lastSeparator),
        index,
      },
    ];
  });
}

function entryLabel(entry: FieldEntry) {
  return `Rank ${entry.rank} · ${entry.name} · Overall Index ${formatScore(entry.index)}`;
}

export function ReadoutField({ data }: ReadoutFieldProps) {
  const entries = parseField(data);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const high = entries[0]?.index ?? 0;
  const low = entries.at(-1)?.index ?? high;
  const span = high - low;
  const litCount = Math.min(5, Math.ceil(entries.length / 8));
  const fieldWidth = Math.max(entries.length * 3 - 1, 1);
  const ticks = entries.map((entry, index) => {
    const height =
      span === 0
        ? 100
        : Math.round(18 + ((entry.index - low) / span) * 82);

    return {
      height,
      path: `M${index * 3} 100V${100 - height}`,
    };
  });
  const activeEntry =
    activeIndex === null ? null : entries[activeIndex] ?? null;
  const activeTick =
    activeIndex === null ? null : ticks[activeIndex] ?? null;
  const summary = `${entries.length} models ranked by Overall Index, from ${formatScore(high)} to ${formatScore(low)}.`;
  const tooltipEdge =
    activeIndex === null
      ? ""
      : activeIndex < 5
        ? " is-start"
        : activeIndex >= entries.length - 5
          ? " is-end"
          : "";

  function inspectPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const progress = (event.clientX - bounds.left) / bounds.width;
    const nextIndex = Math.max(
      0,
      Math.min(entries.length - 1, Math.floor(progress * entries.length)),
    );

    setActiveIndex(nextIndex);
  }

  function moveInspection(event: KeyboardEvent<SVGSVGElement>) {
    let nextIndex = activeIndex ?? 0;

    switch (event.key) {
      case "ArrowLeft":
        nextIndex -= 1;
        break;
      case "ArrowRight":
        nextIndex += 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = entries.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveIndex(Math.max(0, Math.min(entries.length - 1, nextIndex)));
  }

  if (entries.length === 0) return null;

  return (
    <figure className="readout-field">
      <p className="readout-field-label" aria-hidden="true">
        All {entries.length} models <span>Highest → lowest</span>
      </p>
      <svg
        viewBox={`0 0 ${fieldWidth} 100`}
        preserveAspectRatio="none"
        width="100%"
        height="84"
        fill="none"
        strokeWidth="2"
        role="img"
        tabIndex={0}
        aria-label={`${summary} ${
          activeEntry
            ? `Selected: ${entryLabel(activeEntry)}.`
            : "Focus and use the left and right arrow keys to inspect each model."
        }`}
        onBlur={() => {
          setFocused(false);
          setActiveIndex(null);
        }}
        onFocus={() => {
          setFocused(true);
          setActiveIndex((current) => current ?? 0);
        }}
        onKeyDown={moveInspection}
        onPointerDown={inspectPointer}
        onPointerLeave={() => {
          if (!focused) setActiveIndex(null);
        }}
        onPointerMove={inspectPointer}
      >
        <path
          stroke="var(--line-interactive)"
          d={ticks.map((tick) => tick.path).join("")}
        />
        <path
          stroke="var(--signal-500)"
          d={ticks
            .slice(0, litCount)
            .map((tick) => tick.path)
            .join("")}
        />
        {activeIndex !== null && activeTick ? (
          <path
            className="readout-field-active"
            d={`M${activeIndex * 3} 100V${100 - activeTick.height}`}
          />
        ) : null}
      </svg>
      {activeEntry ? (
        <figcaption
          className={`readout-field-tooltip${tooltipEdge}`}
          style={{
            left:
              tooltipEdge === ""
                ? `${((activeIndex! + 0.5) / entries.length) * 100}%`
                : undefined,
          }}
        >
          {entryLabel(activeEntry)}
        </figcaption>
      ) : (
        <figcaption className="sr-only">{summary}</figcaption>
      )}
    </figure>
  );
}
