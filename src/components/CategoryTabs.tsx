"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";

import {
  RANK_SCOPE_OPTIONS,
  type RankScope,
} from "@/lib/categories";

export type { RankScope as Category } from "@/lib/categories";

type CategoryTabsProps = {
  value: RankScope;
  onChange: (category: RankScope) => void;
  panelId: string;
};

/**
 * A real tablist: one tab stop for the whole group with roving tabindex and
 * arrow-key navigation, replacing five separate stops on aria-pressed buttons.
 * The active underline is a single shared element that slides between tabs
 * rather than five elements fading in place.
 */
export const CategoryTabs = memo(function CategoryTabs({
  value,
  onChange,
  panelId,
}: CategoryTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [underline, setUnderline] = useState({ x: 0, w: 0 });
  const [measured, setMeasured] = useState(false);

  const activeIndex = RANK_SCOPE_OPTIONS.findIndex(
    (category) => category.value === value,
  );

  const measure = useCallback(() => {
    const tab = tabRefs.current[activeIndex];
    if (!tab) return;
    setUnderline({ x: tab.offsetLeft, w: tab.offsetWidth });
  }, [activeIndex]);

  useEffect(() => {
    measure();

    // The tablist scrolls horizontally on narrow viewports and the labels
    // reflow with the font, so the underline is re-measured rather than
    // assumed. ResizeObserver covers font-swap and container resize alike.
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (measured || underline.w === 0) return;

    // A frame later, not in the same commit. CSS transitions resolve against
    // the after-change style, so enabling the transition in the commit that
    // first positions the underline still animates it out from width 0 at the
    // tablist's left edge — measured at 170ms on every page load.
    const frame = requestAnimationFrame(() => setMeasured(true));
    return () => cancelAnimationFrame(frame);
  }, [measured, underline.w]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const lastIndex = RANK_SCOPE_OPTIONS.length - 1;
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = activeIndex >= lastIndex ? 0 : activeIndex + 1;
        break;
      case "ArrowLeft":
        nextIndex = activeIndex <= 0 ? lastIndex : activeIndex - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(RANK_SCOPE_OPTIONS[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      className="tablist"
      role="tablist"
      aria-label="Benchmark category"
      data-measured={measured}
      ref={listRef}
      onKeyDown={handleKeyDown}
    >
      {RANK_SCOPE_OPTIONS.map((category, index) => {
        const selected = category.value === value;

        return (
          <button
            key={category.value}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${category.value}`}
            className="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(category.value)}
          >
            {category.label}
          </button>
        );
      })}
      <span
        className="tab-underline"
        aria-hidden="true"
        style={
          {
            "--tab-x": `${underline.x}px`,
            "--tab-w": underline.w,
          } as React.CSSProperties
        }
      />
    </div>
  );
});
