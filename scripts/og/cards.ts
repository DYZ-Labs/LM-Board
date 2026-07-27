/**
 * LM Board Open Graph cards — the "instrument panel" direction.
 *
 * The layout rule is one sentence: **the generator positions every line of text
 * itself, from measured font metrics, at an absolute card coordinate.** Nothing
 * is left to a flow algorithm — no auto margins, no wrapping, no line-clamp, no
 * text-overflow, no baseline alignment, no grid. That buys two things at once:
 *
 *   1. positional invariance. A rail is a number in RAILS below, so the rank
 *      line cannot move because the numeral above it got shorter.
 *   2. portability. satori is asked to draw single-face, single-line strings at
 *      (left, top) and to fill rectangles — the subset every renderer
 *      implements the same way.
 *
 * Every string is derived from the dataset. There are no literal counts
 * anywhere in this file: the card it replaces said "17 models" over a dataset
 * of 62 for months, because one of them was a literal.
 */
import type { Benchmark } from "../../src/lib/schema";
import type { LeaderboardData, LeaderboardRow } from "../../src/lib/data";
import { benchmarksForScope, type RankScope } from "../../src/lib/index";
import { efficientFrontier } from "../../src/lib/visualization";
import { face, type FaceKey } from "./fonts";
import { CARD_COLOURS as C } from "./tokens";
import {
  ellipsise,
  fitLines,
  measure,
  naturalLineHeight,
  place,
  uncovered,
  wrap,
  hardWrapRaw,
  type PlaceOptions,
} from "./type";

export type Style = Record<string, string | number>;
export type Node = {
  type: "div";
  props: { style: Style; children?: Node[] | string };
};

export type InkBox = {
  label: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type Card = { nodes: Node[]; ink: InkBox[]; alt: string };

export const CARD = { width: 1200, height: 630 };

export const RAILS = {
  gutterLeft: 64,
  gutterRight: 1136,
  mastheadRule: 108,
  bodyBottom: 542,

  markCentre: 54,
  wordmarkRail: 90,

  kickerCap: 143,
  nameCap: 188,
  nameLeading: 1.05,
  readoutRail: 838,
  readoutRule: 792,
  indexBaseline: 275,
  rankBaseline: 337,
  metaBaseline: 372,
  stripRule: 402,
  /** Labels bottom-align to this cap rail; a second line sits one leading up. */
  labelCapBottom: 447,
  labelLeading: 19,
  valueBaseline: 493,
  trackTop: 508,
  trackHeight: 6,
  trackMinimumFill: 5,

  heroCap: 150,
  heroLabelCap: 296,
  specTop: 150,
  specRow: 52,
  specWidth: 372,
  rulerBottom: 458,
  rulerHeight: 96,
  rulerMinimumTick: 15,
  captionRule: 472,
  captionBaseline: 494,

  footerBaseline: 592,
} as const;

/* -- formatting, mirroring src/lib/format.ts ------------------------------- */

const score1 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const price2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const counts = new Intl.NumberFormat("en-US");
const dateFull = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dateNoYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export const formatScore = (value: number) => score1.format(value);
export const formatDate = (iso: string) => dateFull.format(new Date(`${iso}T00:00:00Z`));
const formatDayMonth = (iso: string) => dateNoYear.format(new Date(`${iso}T00:00:00Z`));
const formatPrice = (value: number) => (value < 1 ? price2 : score1).format(value);

/**
 * The site prints a context window as `formatCount(n) tokens`, and so does the
 * card. Do not abbreviate it: the data mixes decimal windows (200,000) with
 * binary ones (1,048,576), so no single base is right, and dividing by 1024
 * turns a 200,000-token window into "195K".
 */
export const contextLabel = (tokens: number | undefined) =>
  tokens ? `${counts.format(tokens)} context` : null;

/**
 * The retrieval range. The year is dropped only when both ends share it —
 * printing "Dec 28 – Jan 3, 2026" for a 2025-12-28 retrieval misdates the
 * evidence by a year, which on a provenance product is worse than no date.
 */
export function retrievedRange(row: LeaderboardRow) {
  const dates = Object.values(row.scoresByBenchmark)
    .filter((score) => score != null)
    .map((score) => score.source.retrieved)
    .sort();

  if (!dates.length) return null;

  const first = dates[0];
  const last = dates[dates.length - 1];

  if (first === last) return formatDate(first);
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${formatDayMonth(first)} – ${formatDate(last)}`;
  }
  return `${formatDate(first)} – ${formatDate(last)}`;
}

/* -- glyph coverage -------------------------------------------------------- */

/**
 * Five of the twelve labs are Chinese companies whose names are Latin *today*.
 * Nothing stops a discovery run writing a CJK name tomorrow, and satori draws
 * nothing for a glyph it has no font for — 62 images quietly missing a lab name
 * is worse than a failed build, so this is fatal.
 */
export function assertCoverage(
  strings: { faceKey: FaceKey; text: string; where: string }[],
) {
  const bad = strings
    .map(({ faceKey, text, where }) => {
      const missing = [...new Set(uncovered(faceKey, text))];
      if (!missing.length) return null;
      return `${where}: no shipped face can draw ${missing
        .map(
          (char) =>
            `${JSON.stringify(char)} U+${char
              .codePointAt(0)!
              .toString(16)
              .toUpperCase()
              .padStart(4, "0")}`,
        )
        .join(", ")}`;
    })
    .filter((entry): entry is string => entry !== null);

  if (bad.length) {
    throw new Error(
      "OG card: uncovered glyphs — add the characters to the shipped font " +
        `subset or give the record a Latin display name.\n  ${bad.join("\n  ")}`,
    );
  }
}

/* -- primitives ------------------------------------------------------------ */

export function box(
  left: number,
  top: number,
  width: number,
  height: number,
  style: Style = {},
): Node {
  return {
    type: "div",
    props: {
      style: {
        position: "absolute",
        // Never `inset: 0`. satori ignores it, and the one non-decorative
        // chassis element — the hairline frame — would vanish silently.
        left: `${left.toFixed(2)}px`,
        top: `${top.toFixed(2)}px`,
        width: `${width.toFixed(2)}px`,
        height: `${height.toFixed(2)}px`,
        ...style,
      },
    },
  };
}

export type TextOptions = PlaceOptions & { color?: string };

/**
 * One line of text, absolutely placed by its ink and split into one element per
 * face. The optical correction is `pen = rail − leftSideBearing`, so a round
 * "6", a flag-heavy "1" and a flat "N" all begin on the same rail.
 */
export function text(
  faceKey: FaceKey,
  size: number,
  value: string,
  options: TextOptions,
) {
  const placed = place(faceKey, size, value, options);
  const nodes: Node[] = placed.measurement.runs.map((run) => {
    const runFace = face(run.faceKey);
    return {
      type: "div" as const,
      props: {
        style: {
          position: "absolute",
          left: `${(placed.pen + run.offset).toFixed(2)}px`,
          top: `${placed.top.toFixed(2)}px`,
          lineHeight: `${placed.lineHeight}px`,
          fontSize: `${size}px`,
          fontFamily: runFace.family,
          fontWeight: runFace.weight,
          ...(options.letterSpacing
            ? { letterSpacing: `${options.letterSpacing.toFixed(3)}px` }
            : {}),
          color: options.color ?? C.fgPrimary,
          whiteSpace: "pre",
        },
        children: run.text,
      },
    };
  });

  return { nodes, placed };
}

export type Fragment = {
  faceKey: FaceKey;
  size: number;
  text: string;
  color?: string;
  gapBefore?: number;
  letterSpacing?: number;
};

/** Differently-styled fragments set on one shared baseline. */
export function fragments(
  parts: Fragment[],
  options: { rail?: number; rightRail?: number; baseline: number },
) {
  const measured = parts.map((part) =>
    measure(part.faceKey, part.size, part.text, part.letterSpacing ?? 0),
  );
  const gaps = parts.map((part) => part.gapBefore ?? 0);
  const total = parts.reduce((sum, _, i) => sum + gaps[i] + measured[i].advance, 0);
  const firstInk = measured[0].inkLeft + gaps[0];
  const last = measured[measured.length - 1];
  const lastInk = total - last.advance + last.inkRight;
  const pen =
    options.rail !== undefined
      ? options.rail - firstInk
      : (options.rightRail ?? 0) - lastInk;

  const nodes: Node[] = [];
  let x = pen;

  parts.forEach((part, i) => {
    x += gaps[i];
    const lineHeight = Math.round(naturalLineHeight(part.faceKey, part.size));
    const placed = place(part.faceKey, part.size, part.text, {
      letterSpacing: part.letterSpacing ?? 0,
      lineHeight,
      rail: x + measured[i].inkLeft,
      baseline: options.baseline,
    });
    nodes.push(...text(part.faceKey, part.size, part.text, {
      letterSpacing: part.letterSpacing ?? 0,
      lineHeight,
      rail: placed.inkLeft,
      baseline: options.baseline,
      color: part.color,
    }).nodes);
    x += measured[i].advance;
  });

  return {
    nodes,
    inkLeft: pen + firstInk,
    inkRight: pen + lastInk,
    inkTop: options.baseline - Math.max(...measured.map((m) => m.ascent)),
    inkBottom: options.baseline + Math.max(...measured.map((m) => m.descent)),
  };
}

/* -- chassis --------------------------------------------------------------- */

export function chassis(children: Node[]): Node {
  return {
    type: "div",
    props: {
      style: {
        // satori defaults a div to flex, but only when it is told to; an
        // undeclared display on a root with sixty children is its best-known
        // foot-gun.
        display: "flex",
        position: "relative",
        width: `${CARD.width}px`,
        height: `${CARD.height}px`,
        overflow: "hidden",
        backgroundColor: C.bgBase,
        color: C.fgPrimary,
      },
      children: [
        ...children,
        // A hairline frame, so the card cannot dissolve into a dark Slack or X
        // background. A bordered overlay rather than an inset shadow, because
        // satori draws borders and does not draw inset shadows.
        box(0, 0, CARD.width, CARD.height, {
          border: `1px solid ${C.lineSubtle}`,
        }),
      ],
    },
  };
}

function masthead(builder: Builder) {
  const wordmark = builder.text("archivo680", 27, "LM BOARD", {
    letterSpacing: 0.135 * 27,
    rail: RAILS.wordmarkRail,
    capTop: RAILS.markCentre - (face("archivo680").cap * 27) / 2,
  }, "masthead wordmark");

  builder.add(
    box(RAILS.gutterLeft, RAILS.markCentre - 6, 12, 12, {
      borderRadius: "999px",
      backgroundColor: C.signal500,
    }),
  );
  builder.text("mono400", 20, "checklmboard.xyz", {
    letterSpacing: 0.01 * 20,
    rightRail: RAILS.gutterRight,
    baseline: wordmark.baseline,
  }, "masthead domain");
  builder.add(
    box(0, RAILS.mastheadRule, CARD.width, 1, { backgroundColor: C.lineSubtle }),
  );
}

const provenance = (
  scoreCount: number,
  selfReportedCount: number,
  tail: string,
): Fragment[] => {
  const artificialAnalysisCount = scoreCount - selfReportedCount;
  const ownership =
    selfReportedCount === 0
      ? [
          {
            faceKey: "archivo400" as const,
            size: 19,
            text: "Scores published by ",
            color: C.fgTertiary,
          },
          {
            faceKey: "archivo480" as const,
            size: 19,
            text: "Artificial Analysis",
            color: C.fgSecondary,
          },
        ]
      : [
          {
            faceKey: "archivo400" as const,
            size: 19,
            text: `${artificialAnalysisCount}/${scoreCount} scores by Artificial Analysis`,
            color: C.fgTertiary,
          },
          {
            faceKey: "archivo400" as const,
            size: 19,
            text: "·",
            color: C.fgDisabled,
            gapBefore: 10,
          },
          {
            faceKey: "archivo400" as const,
            size: 19,
            text: `${selfReportedCount} vendor-reported`,
            color: C.fgTertiary,
            gapBefore: 10,
          },
        ];

  return [
    ...ownership,
    {
      faceKey: "archivo400",
      size: 19,
      text: "·",
      color: C.fgDisabled,
      gapBefore: 10,
    },
    {
      faceKey: "archivo400",
      size: 19,
      text: tail,
      color: C.fgTertiary,
      gapBefore: 10,
    },
  ];
};

/* -- the builder ----------------------------------------------------------- */

class Builder {
  nodes: Node[] = [];
  ink: InkBox[] = [];

  add(...nodes: Node[]) {
    this.nodes.push(...nodes);
  }

  text(faceKey: FaceKey, size: number, value: string, options: TextOptions, label: string) {
    const { nodes, placed } = text(faceKey, size, value, options);
    this.nodes.push(...nodes);
    if (value.trim()) {
      this.ink.push({
        label,
        left: placed.inkLeft,
        top: placed.inkTop,
        right: placed.inkRight,
        bottom: placed.inkBottom,
      });
    }
    return placed;
  }

  fragments(parts: Fragment[], options: Parameters<typeof fragments>[1], label: string) {
    const result = fragments(parts, options);
    this.nodes.push(...result.nodes);
    this.ink.push({
      label,
      left: result.inkLeft,
      top: result.inkTop,
      right: result.inkRight,
      bottom: result.inkBottom,
    });
    return result;
  }

  footer(left: Fragment[], right: string) {
    this.add(box(0, RAILS.bodyBottom, CARD.width, 1, { backgroundColor: C.lineSubtle }));
    this.fragments(left, { rail: RAILS.gutterLeft, baseline: RAILS.footerBaseline }, "footer left");
    this.text("mono400", 19, right, {
      rightRail: RAILS.gutterRight,
      baseline: RAILS.footerBaseline,
    }, "footer right");
  }
}

/* ========================================================================= */
/* SITE CARD — /, and any route without a more specific card                  */
/* ========================================================================= */

export type SiteCardOptions = {
  hero?: string;
  heroLabel?: string;
  spec?: [string, string][];
  scope?: RankScope;
  rows?: LeaderboardRow[];
};

export function siteCard(data: LeaderboardData, options: SiteCardOptions = {}): Card {
  const scope = options.scope ?? "overall";
  const rows = options.rows ?? data.rows;
  const ranked = rows
    .filter((row) => row.scopes[scope].index !== null)
    .sort((a, b) => (b.scopes[scope].index ?? 0) - (a.scopes[scope].index ?? 0));
  const values = ranked.map((row) => row.scopes[scope].index as number);
  const high = Math.max(...values);
  const low = Math.min(...values);

  const builder = new Builder();
  masthead(builder);

  const hero = options.hero ?? String(rows.length);
  const heroLabel = (options.heroLabel ?? "Frontier models ranked").toUpperCase();
  const spec: [string, string][] = options.spec ?? [
    ["Benchmarks", String(data.benchmarks.length)],
    ["Cited scores", String(data.scoreCount)],
    ["Labs", String(data.labs.length)],
  ];

  builder.text("mono500", 166, hero, {
    letterSpacing: -0.05 * 166,
    rail: RAILS.gutterLeft,
    capTop: RAILS.heroCap,
  }, "hero numeral");
  const heroLabelPlaced = builder.text("archivo580", 20, heroLabel, {
    letterSpacing: 0.13 * 20,
    rail: RAILS.gutterLeft,
    capTop: RAILS.heroLabelCap,
  }, "hero label");

  const specX = RAILS.gutterRight - RAILS.specWidth;
  spec.forEach(([key, value], i) => {
    const top = RAILS.specTop + i * RAILS.specRow;
    builder.add(box(specX, top, RAILS.specWidth, 1, { backgroundColor: C.lineSubtle }));
    builder.text("archivo400", 20, key, {
      rail: specX,
      baseline: top + RAILS.specRow - 18,
      color: C.fgTertiary,
    }, `spec key ${i}`);
    builder.text("mono500", 32, value, {
      letterSpacing: -0.02 * 32,
      rightRail: RAILS.gutterRight,
      baseline: top + RAILS.specRow - 18,
    }, `spec value ${i}`);
  });
  // The closing rule sits on the hero label's baseline rather than 4px above
  // it: near-alignment that is not alignment reads as a mistake.
  builder.add(
    box(
      specX,
      Math.max(
        RAILS.specTop + spec.length * RAILS.specRow,
        Math.round(heroLabelPlaced.baseline),
      ),
      RAILS.specWidth,
      1,
      { backgroundColor: C.lineSubtle },
    ),
  );

  // The ruler is derived from the field size, never from 62: a 46-model scope
  // and a 200-model board draw the same instrument.
  const n = ranked.length;
  const rulerWidth = RAILS.gutterRight - RAILS.gutterLeft;
  const nominalGap = n > 90 ? 3 : n > 40 ? 5.4 : 8;
  // Capped, so a small field draws a sparse ruler rather than three slabs; the
  // gap then absorbs the remainder, so the last tick always lands on the right
  // gutter. A three-model field that parks its ticks against the left gutter
  // and leaves 930px of empty rule argues that the ruler is not a ruler.
  const tickWidth = Math.min(24, (rulerWidth - (n - 1) * nominalGap) / n);
  const gap = n > 1 ? (rulerWidth - n * tickWidth) / (n - 1) : 0;
  const litCount = Math.min(5, Math.ceil(n / 8));

  ranked.forEach((row, i) => {
    const value = row.scopes[scope].index as number;
    // A 15px floor, so the lowest-ranked model still reads as a tick rather
    // than as an absence — the same trade the bar floor makes.
    const height =
      high === low
        ? RAILS.rulerHeight
        : RAILS.rulerMinimumTick +
          ((value - low) / (high - low)) *
            (RAILS.rulerHeight - RAILS.rulerMinimumTick);
    builder.add(
      box(
        RAILS.gutterLeft + i * (tickWidth + gap),
        RAILS.rulerBottom - height,
        tickWidth,
        height,
        {
          borderRadius: "1.5px",
          backgroundColor: i < litCount ? C.signal500 : C.lineInteractive,
        },
      ),
    );
  });

  builder.add(
    box(RAILS.gutterLeft, RAILS.captionRule, RAILS.gutterRight - RAILS.gutterLeft, 1, {
      backgroundColor: C.lineSubtle,
    }),
  );

  const scopeWord =
    scope === "overall"
      ? "Overall Index"
      : `${scope[0].toUpperCase()}${scope.slice(1)} Index`;
  builder.fragments(
    [
      { faceKey: "mono400", size: 18, text: `${scopeWord}, every ranked model`, color: C.fgTertiary },
      { faceKey: "mono400", size: 18, text: "·", color: C.fgDisabled, gapBefore: 10 },
      { faceKey: "mono400", size: 18, text: `${formatScore(high)} high`, color: C.signal300, gapBefore: 10 },
      { faceKey: "mono400", size: 18, text: "·", color: C.fgDisabled, gapBefore: 10 },
      { faceKey: "mono400", size: 18, text: `${formatScore(low)} low`, color: C.fgTertiary, gapBefore: 10 },
    ],
    { rail: RAILS.gutterLeft, baseline: RAILS.captionBaseline },
    "caption",
  );

  builder.footer(
    provenance(
      data.scoreCount,
      data.selfReportedCount,
      "source + retrieval date on every score",
    ),
    `Newest retrieval ${formatDate(data.lastUpdated)}`,
  );

  return {
    nodes: builder.nodes,
    ink: builder.ink,
    alt: `LM Board — ${rows.length} frontier models ranked on ${data.benchmarks.length} benchmarks by ${data.scoreCount} cited scores.`,
  };
}

/* ========================================================================= */
/* VALUE CARD — /value                                                       */
/* ========================================================================= */

/**
 * The value route gets its own visual argument instead of borrowing Compare's
 * card. The coordinates are the same two facts as the live plot: listed input
 * price on a log axis and the computed Overall Index. Frontier points use the
 * signal colour; dominated points recede.
 */
export function valueCard(data: LeaderboardData): Card {
  const points = data.rows
    .filter(
      (row) =>
        row.model.pricing !== undefined &&
        row.scopes.overall.index !== null,
    )
    .map((row) => ({
      id: row.model.id,
      item: row,
      price: row.model.pricing!.input,
      index: row.scopes.overall.index as number,
    }));
  const frontier = efficientFrontier(points);
  const prices = points.map(({ price }) => price);
  const indexes = points.map(({ index }) => index);
  const minimumPrice = Math.min(...prices);
  const maximumPrice = Math.max(...prices);
  const minimumIndex = Math.min(...indexes);
  const maximumIndex = Math.max(...indexes);
  const logMinimum = Math.log10(Math.max(minimumPrice, Number.EPSILON));
  const logMaximum = Math.log10(Math.max(maximumPrice, Number.EPSILON));
  const builder = new Builder();
  masthead(builder);

  builder.text("mono500", 166, String(points.length), {
    letterSpacing: -0.05 * 166,
    rail: RAILS.gutterLeft,
    capTop: RAILS.heroCap,
  }, "hero numeral");
  builder.text("archivo580", 20, "PRICED MODELS COMPARED", {
    letterSpacing: 0.13 * 20,
    rail: RAILS.gutterLeft,
    capTop: RAILS.heroLabelCap,
  }, "hero label");

  const specX = RAILS.gutterRight - RAILS.specWidth;
  const spec: [string, string][] = [
    ["Best-value options", String(frontier.size)],
    [
      "Listed input / 1M",
      `$${formatPrice(minimumPrice)}–$${formatPrice(maximumPrice)}`,
    ],
    ["Top LM Index", formatScore(maximumIndex)],
  ];
  spec.forEach(([key, value], index) => {
    const top = RAILS.specTop + index * RAILS.specRow;
    builder.add(
      box(specX, top, RAILS.specWidth, 1, {
        backgroundColor: C.lineSubtle,
      }),
    );
    builder.text("archivo400", 20, key, {
      rail: specX,
      baseline: top + RAILS.specRow - 18,
      color: C.fgTertiary,
    }, `spec key ${index}`);
    builder.text("mono500", 32, value, {
      letterSpacing: -0.02 * 32,
      rightRail: RAILS.gutterRight,
      baseline: top + RAILS.specRow - 18,
    }, `spec value ${index}`);
  });
  builder.add(
    box(
      specX,
      RAILS.specTop + spec.length * RAILS.specRow,
      RAILS.specWidth,
      1,
      { backgroundColor: C.lineSubtle },
    ),
  );

  const plot = {
    left: RAILS.gutterLeft,
    right: RAILS.gutterRight,
    top: 354,
    bottom: RAILS.rulerBottom,
  };
  builder.add(
    box(
      plot.left,
      plot.bottom,
      plot.right - plot.left,
      1,
      { backgroundColor: C.lineSubtle },
    ),
  );
  builder.add(
    box(
      plot.left,
      plot.top,
      1,
      plot.bottom - plot.top,
      { backgroundColor: C.lineSubtle },
    ),
  );

  for (const point of points) {
    const xFraction =
      logMaximum === logMinimum
        ? 0.5
        : (Math.log10(Math.max(point.price, Number.EPSILON)) - logMinimum) /
          (logMaximum - logMinimum);
    const yFraction =
      maximumIndex === minimumIndex
        ? 0.5
        : (point.index - minimumIndex) / (maximumIndex - minimumIndex);
    const efficient = frontier.has(point.id);
    const size = efficient ? 11 : 7;

    builder.add(
      box(
        plot.left + xFraction * (plot.right - plot.left) - size / 2,
        plot.bottom - yFraction * (plot.bottom - plot.top) - size / 2,
        size,
        size,
        {
          borderRadius: `${size / 2}px`,
          backgroundColor: efficient ? C.signal500 : C.lineInteractive,
        },
      ),
    );
  }

  builder.add(
    box(
      RAILS.gutterLeft,
      RAILS.captionRule,
      RAILS.gutterRight - RAILS.gutterLeft,
      1,
      { backgroundColor: C.lineSubtle },
    ),
  );
  builder.fragments(
    [
      {
        faceKey: "mono400",
        size: 18,
        text: "Lower listed input price",
        color: C.fgTertiary,
      },
      {
        faceKey: "mono400",
        size: 18,
        text: "·",
        color: C.fgDisabled,
        gapBefore: 10,
      },
      {
        faceKey: "mono400",
        size: 18,
        text: "Higher LM Index",
        color: C.signal300,
        gapBefore: 10,
      },
      {
        faceKey: "mono400",
        size: 18,
        text: "·",
        color: C.fgDisabled,
        gapBefore: 10,
      },
      {
        faceKey: "mono400",
        size: 18,
        text: `${frontier.size} best value`,
        color: C.fgTertiary,
        gapBefore: 10,
      },
    ],
    { rail: RAILS.gutterLeft, baseline: RAILS.captionBaseline },
    "caption",
  );

  builder.footer(
    [
      {
        faceKey: "archivo400",
        size: 19,
        text: "Provider-listed price + LM Index",
        color: C.fgTertiary,
      },
    ],
    `Newest score retrieval ${formatDate(data.lastUpdated)}`,
  );

  return {
    nodes: builder.nodes,
    ink: builder.ink,
    alt: `LM Board value view — ${points.length} models plotted by provider-listed input-token price and LM Index; ${frontier.size} models sit on the best-value line.`,
  };
}

/* ========================================================================= */
/* MODEL CARD — /model/[id]                                                   */
/* ========================================================================= */

export const ONE_LINE_LADDER = [84, 76, 68];
export const TWO_LINE_LADDER = [76, 68, 60, 54];
export const NAME_TRACKING = -0.028;
/** The name box, 40px clear of the readout rule. */
export const NAME_WIDTH = RAILS.readoutRule - 40 - RAILS.gutterLeft;

export const fitName = (name: string, width = NAME_WIDTH) =>
  fitLines("archivo580", ONE_LINE_LADDER, TWO_LINE_LADDER, name, NAME_TRACKING, width, 2);

/** Ranks shared by more than one model in a scope. Standard competition ranking
 *  produces them by design — 34 models share a rank on Math today — and a card
 *  that prints an unqualified "Rank 53 of 62" ten times is the defect. */
export function tiedRanks(rows: LeaderboardRow[], scope: RankScope) {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const rank = row.scopes[scope].rank;
    if (rank !== null) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([rank]) => rank));
}

export function modelFacts(row: LeaderboardRow) {
  const pricing = row.model.pricing;
  const meta = [`Released ${formatDate(row.model.releaseDate)}`];

  if (pricing) {
    meta.push(`$${formatPrice(pricing.input)} / $${formatPrice(pricing.output)} per M tokens`);
  } else {
    meta.push(row.model.openWeights ? "Open weights" : "Price not published");
  }

  const context = contextLabel(row.model.contextWindow);
  if (context) meta.push(context);

  return { meta, retrieved: retrievedRange(row) };
}

export function modelAlt(row: LeaderboardRow, scope: RankScope, tied: boolean) {
  const s = row.scopes[scope];
  const label = scope === "overall" ? "Overall Index" : `${scope[0].toUpperCase()}${scope.slice(1)} Index`;

  if (s.index === null) {
    return `${row.model.name} — not ranked: ${s.coverageCount} of ${s.coverageTotal} benchmarks measured, below the coverage bar the Index needs.`;
  }

  return `${row.model.name} — ${label} ${formatScore(s.index)}, ${tied ? "tied at" : "rank"} ${s.rank} of ${s.rankedFieldSize}, ${s.coverageCount} of ${s.coverageTotal} benchmarks measured.`;
}

export type ModelCardOptions = {
  scope?: RankScope;
  benchmarks?: Benchmark[];
  tied?: boolean;
  /** Renders what a font-less renderer would draw, for the degradation demo. */
  degradeUncovered?: boolean;
};

export function modelCard(
  row: LeaderboardRow,
  data: LeaderboardData,
  options: ModelCardOptions = {},
): Card {
  const scope = options.scope ?? "overall";
  const s = row.scopes[scope];
  // The strip follows the scope the readout is reporting. Showing all eight
  // benchmarks under "2 of 2 benchmarks measured" is the same contradiction as
  // a hard-coded count, one level up.
  const benchmarks = options.benchmarks ?? benchmarksForScope(data.benchmarks, scope);
  const facts = modelFacts(row);
  const builder = new Builder();
  masthead(builder);

  if (!options.degradeUncovered) {
    assertCoverage([
      { faceKey: "archivo580", text: row.model.name, where: `${row.model.id} name` },
      { faceKey: "archivo580", text: row.model.lab, where: `${row.model.id} lab` },
      ...benchmarks.map((benchmark) => ({
        faceKey: "archivo400" as FaceKey,
        text: benchmark.name,
        where: `benchmark ${benchmark.id}`,
      })),
    ]);
  }

  const show = (faceKey: FaceKey, value: string) =>
    options.degradeUncovered
      ? [...value].map((char) => (uncovered(faceKey, char).length ? " " : char)).join("")
      : value;

  /* -- identity column ---------------------------------------------------- */
  const kickerTracking = 0.115 * 17;
  builder.text(
    "archivo580",
    17,
    ellipsise(
      "archivo580",
      17,
      `Model record · ${show("archivo580", row.model.lab)}`.toUpperCase(),
      kickerTracking,
      NAME_WIDTH,
    ),
    {
      letterSpacing: kickerTracking,
      rail: RAILS.gutterLeft,
      capTop: RAILS.kickerCap,
      color: C.fgTertiary,
    },
    "kicker",
  );

  const fit = fitName(show("archivo580", row.model.name));
  fit.lines.forEach((line, i) => {
    builder.text("archivo580", fit.size, line, {
      letterSpacing: NAME_TRACKING * fit.size,
      rail: RAILS.gutterLeft,
      capTop: RAILS.nameCap + i * Math.round(fit.size * RAILS.nameLeading),
    }, `name line ${i}`);
  });

  const metaParts: Fragment[] = [];
  facts.meta.forEach((slot, i) => {
    if (i) {
      metaParts.push({ faceKey: "archivo400", size: 20, text: "·", color: C.fgDisabled, gapBefore: 10 });
    }
    metaParts.push({
      faceKey: "archivo400",
      size: 20,
      text: slot,
      color: C.fgTertiary,
      gapBefore: i ? 10 : 0,
    });
  });
  builder.fragments(metaParts, { rail: RAILS.gutterLeft, baseline: RAILS.metaBaseline }, "meta");

  /* -- readout column ----------------------------------------------------- */
  builder.add(
    box(
      RAILS.readoutRule,
      RAILS.kickerCap - 12,
      1,
      RAILS.metaBaseline + 12 - (RAILS.kickerCap - 12),
      { backgroundColor: C.lineSubtle },
    ),
  );
  builder.text(
    "archivo580",
    17,
    (scope === "overall" ? "Overall index" : `${scope} index`).toUpperCase(),
    {
      letterSpacing: 0.115 * 17,
      rail: RAILS.readoutRail,
      capTop: RAILS.kickerCap,
      color: C.signal300,
    },
    "readout label",
  );

  const hasIndex = s.index !== null;

  if (hasIndex) {
    const whole = formatScore(s.index as number);
    const dot = whole.indexOf(".");
    const integerPart = whole.slice(0, dot);
    const decimalPart = whole.slice(dot);
    const integerSize = 122;
    const decimalSize = 66;
    const integerTracking = -0.055 * integerSize;
    const decimalTracking = -0.045 * decimalSize;
    const integerPlaced = builder.text("mono500", integerSize, integerPart, {
      letterSpacing: integerTracking,
      rail: RAILS.readoutRail,
      baseline: RAILS.indexBaseline,
    }, "index integer");
    // The decimal continues the integer's pen, so the two read as one number
    // rather than two words. Splitting it at 54% is what fits a five-glyph
    // readout into a 298px column with no size step at the ceiling.
    const advance =
      measure("mono500", integerSize, integerPart, integerTracking).advance + integerTracking;
    builder.text("mono500", decimalSize, decimalPart, {
      letterSpacing: decimalTracking,
      rail:
        integerPlaced.pen +
        advance +
        measure("mono500", decimalSize, decimalPart, decimalTracking).inkLeft,
      baseline: RAILS.indexBaseline,
      color: C.fgSecondary,
    }, "index decimal");
  } else {
    // 16 of 62 models have no Index on Coding and on Agentic, so this is a
    // normal state, not an exception: same slot, same baseline, same size.
    builder.text("mono500", 122, "n/a", {
      letterSpacing: -0.055 * 122,
      rail: RAILS.readoutRail,
      baseline: RAILS.indexBaseline,
      color: C.fgTertiary,
    }, "index");
  }

  const tied = hasIndex && (options.tied ?? tiedRanks(data.rows, scope).has(s.rank as number));
  builder.fragments(
    hasIndex
      ? [
          { faceKey: "mono500", size: 27, text: `${tied ? "Tied" : "Rank"} ${s.rank}` },
          { faceKey: "mono500", size: 27, text: ` of ${s.rankedFieldSize}`, color: C.fgTertiary },
        ]
      : [{ faceKey: "mono500", size: 27, text: "Not ranked", color: C.fgTertiary }],
    { rail: RAILS.readoutRail, baseline: RAILS.rankBaseline },
    "rank",
  );

  // The coverage line's width is a function of the benchmark count, so its size
  // has to be too: at eleven of twelve it overflows the 298px column at 18px
  // and would fail the build rather than degrade.
  const coverage = `${s.coverageCount} of ${s.coverageTotal} benchmarks measured`;
  const readoutWidth = RAILS.gutterRight - RAILS.readoutRail;
  const coverageSize =
    [18, 17, 16, 15].find(
      (size) => measure("mono400", size, coverage, 0).width <= readoutWidth,
    ) ?? 15;
  builder.text("mono400", coverageSize, coverage, {
    rail: RAILS.readoutRail,
    baseline: RAILS.metaBaseline,
    color: C.fgTertiary,
  }, "coverage");

  /* -- benchmark strip ---------------------------------------------------- */
  builder.add(
    box(RAILS.gutterLeft, RAILS.stripRule, RAILS.gutterRight - RAILS.gutterLeft, 1, {
      backgroundColor: C.lineSubtle,
    }),
  );

  const n = benchmarks.length;
  const gap = n <= 8 ? 18 : n <= 10 ? 15 : 12;
  const columnWidth = (RAILS.gutterRight - RAILS.gutterLeft - (n - 1) * gap) / n;
  const labelSize = columnWidth >= 100 ? 15 : 13;
  const valueSize = columnWidth >= 100 ? 25 : columnWidth >= 84 ? 22 : 20;

  benchmarks.forEach((benchmark, i) => {
    const x = RAILS.gutterLeft + i * (columnWidth + gap);
    const score = row.scoresByBenchmark[benchmark.id];
    const label = show("archivo400", benchmark.name);
    const lines =
      wrap("archivo400", labelSize, label, 0, columnWidth, 2) ??
      (() => {
        const raw = hardWrapRaw("archivo400", labelSize, label, 0, columnWidth);
        return [
          raw[0].replace(/\s+$/, ""),
          ellipsise("archivo400", labelSize, raw.slice(1).join(""), 0, columnWidth),
        ];
      })();

    // Labels bottom-align to one rail. Top-aligning them left one-line and
    // two-line labels ending 19px apart across the row, which reads as ragged
    // rather than as designed.
    lines.forEach((line, li) =>
      builder.text("archivo400", labelSize, line, {
        rail: x,
        capTop: RAILS.labelCapBottom - (lines.length - 1 - li) * RAILS.labelLeading,
        color: C.fgTertiary,
      }, `label ${i}.${li}`),
    );

    const displayed = score ? formatScore(score.value) : null;
    builder.text("mono500", valueSize, displayed ?? "—", {
      letterSpacing: -0.02 * valueSize,
      rail: x,
      baseline: RAILS.valueBaseline,
      color: displayed ? C.fgPrimary : C.fgTertiary,
    }, `value ${i}`);

    // Zero versus missing, made real. A measured value draws a track; a missing
    // one draws nothing at all. So a measured 0.0 is a full, empty track —
    // visibly a channel with no reading — and "—" is an absence.
    if (score) {
      builder.add(
        box(x, RAILS.trackTop, columnWidth, RAILS.trackHeight, {
          borderRadius: "3px",
          backgroundColor: C.bgRaised,
        }),
      );
      // Driven by the *displayed* value, so a 0.04 that prints "0.0" cannot
      // also draw a bar. Non-percent benchmarks have no natural 0–100 scale, so
      // they are scaled by that benchmark's own measured span instead of being
      // treated as percentages.
      const reference =
        benchmark.unit === "percent"
          ? 100
          : Math.max(data.benchmarkDomains[benchmark.id]?.max ?? 0, Number.EPSILON);
      const fraction = Math.min(1, Math.max(0, Number(displayed) / reference));
      if (fraction > 0) {
        builder.add(
          box(
            x,
            RAILS.trackTop,
            Math.max(RAILS.trackMinimumFill, fraction * columnWidth),
            RAILS.trackHeight,
            { borderRadius: "3px", backgroundColor: C.signal500 },
          ),
        );
      }
    }
  });

  const measured = benchmarks.filter(
    (benchmark) => row.scoresByBenchmark[benchmark.id] != null,
  ).length;
  const selfReported = benchmarks.filter(
    (benchmark) => row.scoresByBenchmark[benchmark.id]?.selfReported,
  ).length;
  builder.footer(
    measured > 0
      ? provenance(
          measured,
          selfReported,
          `${measured} sourced score${measured === 1 ? "" : "s"}`,
        )
      : [
          {
            faceKey: "archivo400",
            size: 19,
            text: "No measured scores in this record",
            color: C.fgTertiary,
          },
        ],
    facts.retrieved ? `Retrieved ${facts.retrieved}` : "Not yet retrieved",
  );

  return { nodes: builder.nodes, ink: builder.ink, alt: modelAlt(row, scope, tied) };
}
