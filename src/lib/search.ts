/**
 * Model search.
 *
 * The board and the palette both used `${name} ${lab} ${id}`.includes(query),
 * which is why `gpt5`, `gpt 5`, `gemini pro`, `glm 5` and `anthropic opus` all
 * returned nothing on a dataset that contains every one of them: the separators
 * people omit ("GPT-5.6" typed as "gpt5") and the ones they add ("gpt 5") both
 * broke the single literal comparison, and two words could never match two
 * different fields.
 *
 * The fix is two haystacks and an AND over tokens. `spaced` collapses every
 * separator to one space so word boundaries survive; `compact` removes them so
 * a model number types the way it is spoken. A candidate matches only if every
 * token hits somewhere — which is what makes `anthropic opus` mean "an Opus, by
 * Anthropic" rather than a literal string nobody has ever written down.
 */

export type SearchTarget = {
  name: string;
  lab: string;
  id: string;
};

/** Half-open `[start, end)` over the *original* `name`, for `<mark>`. */
export type MatchRange = [number, number];

export type SearchScore = {
  /** 0 means no match. Higher is a better answer to the same query. */
  score: number;
  ranges: MatchRange[];
};

const NO_MATCH: SearchScore = { score: 0, ranges: [] };

/** Weights are ordered, not additive: a token scores its best field only. */
const W_NAME_PREFIX = 100;
const W_NAME_WORD = 80;
const W_NAME_SUBSTRING = 60;
const W_LAB = 40;
const W_ID = 25;
const W_FUZZY = 10;

/** Below this a typo is indistinguishable from a different word. */
const FUZZY_MIN_LENGTH = 4;

type Haystack = {
  /** Separators collapsed to single spaces, so word starts are findable. */
  spaced: string;
  /** Separators removed, so `gpt5` finds `GPT-5.6`. */
  compact: string;
  words: string[];
  /** compact index → index in the original `name`, for match ranges. */
  nameMap: number[];
  nameCompact: string;
  nameSpaced: string;
  nameWords: string[];
  labSpaced: string;
  labCompact: string;
  idSpaced: string;
};

const haystacks = new WeakMap<object, Haystack>();

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en");
}

function spacedOf(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function compactOf(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, "");
}

/**
 * Compacts the name while remembering where each surviving character came
 * from, so a match found in the compacted form can be highlighted in the
 * string the reader actually sees.
 */
function compactName(name: string): { compact: string; map: number[] } {
  let compact = "";
  const map: number[] = [];

  // NFKD can expand one source character into several, which would desync the
  // map. Fold per character so every entry stays anchored to its own index.
  for (let index = 0; index < name.length; index += 1) {
    const character = fold(name[index]).replace(/[^a-z0-9]+/g, "");
    for (let offset = 0; offset < character.length; offset += 1) {
      compact += character[offset];
      map.push(index);
    }
  }

  return { compact, map };
}

function haystackOf(target: SearchTarget): Haystack {
  const cached = haystacks.get(target);
  if (cached) return cached;

  const nameSpaced = spacedOf(target.name);
  const labSpaced = spacedOf(target.lab);
  const idSpaced = spacedOf(target.id);
  const spaced = `${nameSpaced} ${labSpaced} ${idSpaced}`.trim();
  const { compact, map } = compactName(target.name);

  const built: Haystack = {
    spaced,
    compact: spaced.replace(/ /g, ""),
    words: spaced.split(" ").filter(Boolean),
    nameMap: map,
    nameCompact: compact,
    nameSpaced,
    nameWords: nameSpaced.split(" ").filter(Boolean),
    labSpaced,
    labCompact: labSpaced.replace(/ /g, ""),
    idSpaced,
  };

  haystacks.set(target, built);
  return built;
}

/** True when `a` and `b` are one edit apart or identical. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.length - shorter.length > 1) return false;

  let shortIndex = 0;
  let longIndex = 0;
  let edited = false;

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }

    if (edited) return false;
    edited = true;

    // Same length means a substitution; otherwise the extra character is in
    // the longer string and only that cursor advances.
    if (shorter.length === longer.length) shortIndex += 1;
    longIndex += 1;
  }

  return true;
}

function startsAWord(words: string[], token: string): boolean {
  return words.some((word) => word.startsWith(token));
}

function scoreToken(hay: Haystack, token: string): number {
  const compactToken = compactOf(token);
  if (!compactToken) return 0;

  if (
    hay.nameSpaced.startsWith(token) ||
    hay.nameCompact.startsWith(compactToken)
  ) {
    return W_NAME_PREFIX;
  }

  if (startsAWord(hay.nameWords, token)) return W_NAME_WORD;

  if (hay.nameSpaced.includes(token) || hay.nameCompact.includes(compactToken)) {
    return W_NAME_SUBSTRING;
  }

  if (hay.labSpaced.includes(token) || hay.labCompact.includes(compactToken)) {
    return W_LAB;
  }

  if (hay.idSpaced.includes(token) || hay.compact.includes(compactToken)) {
    return W_ID;
  }

  if (
    token.length >= FUZZY_MIN_LENGTH &&
    hay.words.some((word) => withinOneEdit(word, token))
  ) {
    return W_FUZZY;
  }

  return 0;
}

function rangesForToken(hay: Haystack, token: string): MatchRange | null {
  const compactToken = compactOf(token);
  if (!compactToken) return null;

  const at = hay.nameCompact.indexOf(compactToken);
  if (at === -1) return null;

  const start = hay.nameMap[at];
  const end = hay.nameMap[at + compactToken.length - 1] + 1;

  return Number.isInteger(start) && Number.isInteger(end) ? [start, end] : null;
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length < 2) return ranges;

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: MatchRange[] = [sorted[0]];

  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

export function tokenizeQuery(query: string): string[] {
  return spacedOf(query).split(" ").filter(Boolean);
}

/**
 * The palette's ordering key. Every token must hit — an unmatched token means
 * the candidate is not an answer, not merely a worse one.
 */
export function scoreTarget(query: string, target: SearchTarget): SearchScore {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return NO_MATCH;

  const hay = haystackOf(target);
  let score = 0;
  const ranges: MatchRange[] = [];

  for (const token of tokens) {
    const tokenScore = scoreToken(hay, token);
    if (tokenScore === 0) return NO_MATCH;

    score += tokenScore;
    const range = rangesForToken(hay, token);
    if (range) ranges.push(range);
  }

  return { score, ranges: mergeRanges(ranges) };
}

export function matchesTarget(query: string, target: SearchTarget): boolean {
  return scoreTarget(query, target).score > 0;
}

/**
 * Palette ordering. Text alone cannot separate "Claude Opus 5" from
 * "Claude Opus 4.5" for the query `opus 5` — both spell every token — so the
 * tie falls to standing on the board, which is the answer the reader wants and
 * the one file order got backwards.
 */
export function compareMatches(
  a: { score: number; rank: number | null },
  b: { score: number; rank: number | null },
): number {
  if (a.score !== b.score) return b.score - a.score;

  return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
}

/** Structural, so both `LeaderboardRow` and its client projection satisfy it. */
type ModelRow = { model: SearchTarget };

/** Contract C-k: the board's filter predicate. */
export function matchesModelQuery(query: string, row: ModelRow): boolean {
  return tokenizeQuery(query).length === 0 || matchesTarget(query, row.model);
}

/** Contract C-k: the palette's ordering key and highlight ranges. */
export function scoreModel(query: string, row: ModelRow): SearchScore {
  return scoreTarget(query, row.model);
}
