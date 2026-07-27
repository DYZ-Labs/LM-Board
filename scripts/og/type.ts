/**
 * The card's typesetter. Everything the layout needs to know about a string is
 * arithmetic over the font binaries: how wide it is, where its ink starts,
 * where its baseline sits, where it breaks, and where it has to be truncated.
 *
 * satori is then only ever asked to draw a single-face, single-line string at
 * an absolute (left, top). No wrapping, no clamping, no text-overflow, no
 * baseline alignment, no measurement — none of the CSS that satori either lacks
 * or implements differently. That is the portability contract, and it is also
 * what makes a rail a rail: the rank line cannot move because the numeral above
 * it got shorter, because nothing about the rank line is derived from it.
 */
import { FALLBACK_ORDER, covers, face, glyph, kern, type FaceKey } from "./fonts";

/** A maximal span of one string that one face can draw. */
export type Run = {
  faceKey: FaceKey;
  text: string;
  /** Pen offset from the start of the whole string, in px. */
  offset: number;
};

export type Measurement = {
  /** Pen advance, excluding the trailing letter-space (which moves no ink). */
  advance: number;
  /** Ink extents relative to the pen origin. `left` is the side bearing. */
  inkLeft: number;
  inkRight: number;
  ascent: number;
  descent: number;
  width: number;
  runs: Run[];
};

/** The face that draws `char`, or null when nothing shipped can. */
export function resolveFace(preferred: FaceKey, char: string): FaceKey | null {
  if (covers(preferred, char)) return preferred;
  return FALLBACK_ORDER.find((key) => covers(key, char)) ?? null;
}

export function uncovered(preferred: FaceKey, text: string) {
  return [...text].filter(
    (char) => char !== " " && resolveFace(preferred, char) === null,
  );
}

const EMPTY: Measurement = {
  advance: 0,
  inkLeft: 0,
  inkRight: 0,
  ascent: 0,
  descent: 0,
  width: 0,
  runs: [],
};

/**
 * Single-line measurement, splitting into per-face runs as it goes. Kerning is
 * applied only inside a run: two adjacent glyphs from different faces have no
 * kern pair, and satori — which sees them as two elements — would not apply one
 * either.
 */
export function measure(
  faceKey: FaceKey,
  size: number,
  text: string,
  letterSpacing = 0,
): Measurement {
  if (!text.length) return EMPTY;

  const chars = [...text];
  const runs: Run[] = [];
  let pen = 0;
  let inkLeft = Infinity;
  let inkRight = -Infinity;
  let ascent = 0;
  let descent = 0;
  let current: Run | null = null;

  chars.forEach((char, i) => {
    // An uncovered glyph is drawn as the preferred face's .notdef only when
    // `assertCoverage` has already been told to allow it (the degraded demo);
    // every real card fails the build before reaching here.
    const key = resolveFace(faceKey, char) ?? faceKey;
    const g = glyph(key, char);

    if (!current || current.faceKey !== key) {
      current = { faceKey: key, text: char, offset: pen };
      runs.push(current);
    } else {
      current.text += char;
    }

    inkLeft = Math.min(inkLeft, pen + g.inkLeft * size);
    inkRight = Math.max(inkRight, pen + g.inkRight * size);
    ascent = Math.max(ascent, g.inkAscent * size);
    descent = Math.max(descent, g.inkDescent * size);
    pen += g.advance * size;

    if (i < chars.length - 1) {
      const nextKey = resolveFace(faceKey, chars[i + 1]) ?? faceKey;
      if (nextKey === key) pen += kern(key, char, chars[i + 1]) * size;
      pen += letterSpacing;
    }
  });

  if (!Number.isFinite(inkLeft)) inkLeft = 0;
  if (!Number.isFinite(inkRight)) inkRight = 0;

  return {
    advance: pen,
    inkLeft,
    inkRight,
    ascent,
    descent,
    width: inkRight - inkLeft,
    runs,
  };
}

/**
 * Where a baseline lands inside a line box of height `lh`. This is satori's own
 * formula — `ascender + (lineBox − (ascender − descender)) / 2` — restated over
 * per-em values, and it was verified against rendered pixels at 5 faces × 7
 * sizes × 3 line heights before anything was built on it.
 */
export function baselineInBox(faceKey: FaceKey, size: number, lh: number) {
  const f = face(faceKey);
  return (lh - (f.ascent + f.descent) * size) / 2 + f.ascent * size;
}

export const naturalLineHeight = (faceKey: FaceKey, size: number) => {
  const f = face(faceKey);
  return (f.ascent + f.descent) * size;
};

export type PlaceOptions = {
  letterSpacing?: number;
  lineHeight?: number;
  /** Exactly one of these three fixes the horizontal position. */
  rail?: number;
  rightRail?: number;
  centreOn?: number;
  /** Exactly one of these two fixes the vertical position. */
  baseline?: number;
  capTop?: number;
};

export type Placement = {
  pen: number;
  top: number;
  lineHeight: number;
  baseline: number;
  inkLeft: number;
  inkRight: number;
  inkTop: number;
  inkBottom: number;
  measurement: Measurement;
};

/**
 * Places a line so its INK lands where the design asked, not where the first
 * glyph's side bearing happens to put the pen. Without this the Index numeral
 * moves 2.7px between a leading "1" and a leading "4", and 55 model names start
 * at seven different x positions.
 */
export function place(
  faceKey: FaceKey,
  size: number,
  text: string,
  options: PlaceOptions,
): Placement {
  const { letterSpacing = 0, rail, rightRail, centreOn, baseline, capTop } = options;
  const m = measure(faceKey, size, text, letterSpacing);
  const f = face(faceKey);
  const lineHeight =
    options.lineHeight ?? Math.round(naturalLineHeight(faceKey, size));
  const base = baseline ?? (capTop ?? 0) + f.cap * size;
  let pen: number;

  if (rail !== undefined) pen = rail - m.inkLeft;
  else if (rightRail !== undefined) pen = rightRail - m.inkRight;
  else pen = (centreOn ?? 0) - (m.inkLeft + m.inkRight) / 2;

  return {
    pen,
    top: base - baselineInBox(faceKey, size, lineHeight),
    lineHeight,
    baseline: base,
    inkLeft: pen + m.inkLeft,
    inkRight: pen + m.inkRight,
    inkTop: base - m.ascent,
    inkBottom: base + m.descent,
    measurement: m,
  };
}

/* -- line breaking --------------------------------------------------------- */

/** Break opportunities: after a space, and after "-" or "/" inside a token. */
function segments(text: string) {
  const out: string[] = [];
  let current = "";

  for (const char of text) {
    current += char;
    if (char === " " || char === "-" || char === "/") {
      out.push(current);
      current = "";
    }
  }

  if (current) out.push(current);
  return out;
}

const rtrim = (value: string) => value.replace(/\s+$/, "");

/**
 * Greedy wrap into at most `maxLines`, returning the lines **untrimmed** so
 * they concatenate back to the original string exactly. That is load-bearing:
 * the prototype trimmed here and rejoined the overflow with `join("")`, which
 * deleted the word space and shipped a benchmark called
 * "Multilingual InstructionFollo…" — a misspelling, in a delivered artefact, on
 * a product whose whole claim is provenance. Joining with a space instead would
 * only move the damage to "Terminal- Bench", because "-" is also a break point.
 *
 * Returns null when the text cannot be made to fit; the caller steps the type
 * size down, and truncates only when it has run out of steps.
 */
export function wrapRaw(
  faceKey: FaceKey,
  size: number,
  text: string,
  letterSpacing: number,
  width: number,
  maxLines: number,
): string[] | null {
  const lines: string[] = [];
  let current = "";

  for (const segment of segments(text)) {
    const next = current + segment;

    if (current && measure(faceKey, size, rtrim(next), letterSpacing).width > width) {
      lines.push(current);
      current = segment;
      if (lines.length === maxLines) return null;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  if (lines.length > maxLines) return null;

  for (const line of lines) {
    if (measure(faceKey, size, rtrim(line), letterSpacing).width > width) return null;
  }

  return lines;
}

export function wrap(
  faceKey: FaceKey,
  size: number,
  text: string,
  letterSpacing: number,
  width: number,
  maxLines: number,
) {
  return wrapRaw(faceKey, size, text, letterSpacing, width, maxLines)?.map(rtrim) ?? null;
}

/**
 * Breaks at every opportunity and, where a single token still overflows, inside
 * the token. Never returns null, and every returned piece fits — so the
 * truncation path has no branch that can emit an unfitting line. The prototype
 * fell back to `[wholeString]` here, which put 288px of ink in a 118px column
 * and failed the build with an unrelated "ink overlap" message.
 */
export function hardWrapRaw(
  faceKey: FaceKey,
  size: number,
  text: string,
  letterSpacing: number,
  width: number,
): string[] {
  const lines: string[] = [];
  let current = "";

  const flush = () => {
    if (current) lines.push(current);
    current = "";
  };

  for (const segment of segments(text)) {
    const next = current + segment;

    if (measure(faceKey, size, rtrim(next), letterSpacing).width <= width) {
      current = next;
      continue;
    }

    flush();

    if (measure(faceKey, size, rtrim(segment), letterSpacing).width <= width) {
      current = segment;
      continue;
    }

    // One unbreakable token wider than the column: break it by character.
    for (const char of segment) {
      if (
        current &&
        measure(faceKey, size, rtrim(current + char), letterSpacing).width > width
      ) {
        flush();
      }
      current += char;
    }
  }

  flush();
  return lines.length ? lines : [text];
}

/** Hard truncation with an ellipsis, used only after every size step failed. */
export function ellipsise(
  faceKey: FaceKey,
  size: number,
  text: string,
  letterSpacing: number,
  width: number,
) {
  if (measure(faceKey, size, text, letterSpacing).width <= width) return text;

  let low = 0;
  let high = [...text].length;
  const chars = [...text];

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${rtrim(chars.slice(0, mid).join(""))}…`;
    if (measure(faceKey, size, candidate, letterSpacing).width <= width) low = mid;
    else high = mid - 1;
  }

  return `${rtrim(chars.slice(0, low).join(""))}…`;
}

export type Fit = { size: number; lines: string[]; truncated: boolean };

/**
 * Largest size on the ladder that sets `text` in one line; failing that, the
 * largest that sets it in `maxLines`; failing that, the smallest size with the
 * last line ellipsised. Chosen by measured advance width — never by counting
 * characters, which is what set "Claude Sonnet 4.5" two steps below
 * "Claude Sonnet 5" in the same product family.
 */
export function fitLines(
  faceKey: FaceKey,
  oneLineLadder: number[],
  manyLineLadder: number[],
  text: string,
  tracking: number,
  width: number,
  maxLines: number,
): Fit {
  for (const size of oneLineLadder) {
    const lines = wrap(faceKey, size, text, tracking * size, width, 1);
    if (lines) return { size, lines, truncated: false };
  }

  for (const size of manyLineLadder) {
    const lines = wrap(faceKey, size, text, tracking * size, width, maxLines);
    if (lines) return { size, lines, truncated: false };
  }

  const size = manyLineLadder[manyLineLadder.length - 1];
  const letterSpacing = tracking * size;
  const raw = hardWrapRaw(faceKey, size, text, letterSpacing, width);
  const kept = raw.slice(0, maxLines - 1).map(rtrim);
  // `raw` is untrimmed, so this rejoin is the original substring, spaces and
  // hyphens intact.
  const rest = raw.slice(maxLines - 1).join("");

  kept.push(ellipsise(faceKey, size, rest, letterSpacing, width));
  return { size, lines: kept, truncated: true };
}
