"use client";

import { useEffect } from "react";

import { trackEvent } from "@/lib/track";

/**
 * One delegated listener for every citation on the page.
 *
 * Opening a source is the trust action this product is built around, so it is
 * the event most worth counting — but it cannot be counted per link. The board
 * renders 456 of them, and 456 handler closures cost more than the measurement
 * is worth; and two of the six places a citation appears (`DetailPanel`,
 * `ModelRecord`) are server components that cannot carry a handler at all.
 *
 * The board's citations are matched on the class they already carry for styling
 * rather than on an added attribute: `data-source="<id>"` on 456 anchors cost
 * 10KB of the homepage's byte budget, and the per-benchmark breakdown is not
 * worth that on the surface where it is most expensive. The deliberate
 * verification surfaces — a detail panel or a model record, eight links rather
 * than 456 — do carry the id, so the breakdown survives where it is cheap.
 *
 * Click covers keyboard activation too: Enter on an anchor dispatches one.
 */
const CITATION_SELECTOR = "a[data-source], a.score-source";

export function SourceClickTracker() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest(CITATION_SELECTOR);
      if (!link) return;

      const benchmark = link.getAttribute("data-source");

      trackEvent("source_click", {
        surface: benchmark ? "record" : "board",
        ...(benchmark ? { benchmark } : {}),
      });
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
