"use client";

import { track } from "@vercel/analytics";

/**
 * The conversion loop, instrumented.
 *
 * The product's goal is to become the cited reference, and four of the five
 * hypotheses in REDESIGN_PLAN.md §4.5 depend on events that pageviews alone
 * cannot produce: whether anyone opens a source, expands a row, or copies a
 * link. Vercel's beacon is same-origin, so this needs no CSP change.
 *
 * The name union is closed on purpose. Event names become dashboard columns that
 * are painful to rename later, so a typo should be a build error rather than a
 * second column that quietly splits the data.
 */
export type ConversionEvent =
  /** A shareable URL was copied. `surface` says which of the four buttons. */
  | "copy_link"
  /** An outbound click to a score's source — the trust action. */
  | "source_click"
  /** A row's detail panel was opened. */
  | "row_expand"
  /** Table / profile / plot. Pairs with viewport to judge the narrow default. */
  | "projection_switch"
  /** Chooser constraints were applied, reset, or explicitly relaxed. */
  | "chooser_apply"
  /** The generated shortlist was opened in the comparison route. */
  | "shortlist_compare"
  /** A record was opened from a chooser recommendation card. */
  | "shortlist_record_open"
  /**
   * A ⌘K result was opened. `kind` says whether the palette is used to reach
   * models, benchmarks or pages; `query` carries only its length, because the
   * question is whether anyone opens it at all — the string itself is not
   * needed to answer that and is not ours to collect.
   */
  | "palette_navigate";

type EventProperties = Record<string, string | number | boolean | null>;

/**
 * Fire and forget. Analytics must never be able to break an interaction, so a
 * blocked beacon, an ad blocker, or a missing script is swallowed — the copy
 * still lands and the link still opens.
 */
export function trackEvent(
  event: ConversionEvent,
  properties?: EventProperties,
) {
  try {
    track(event, properties);
  } catch {
    // Intentionally silent: see above.
  }
}
