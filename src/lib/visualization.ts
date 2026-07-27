/**
 * Pure visualization derivations shared by the plot and model records.
 *
 * Geometry may be responsive, but the facts it represents must not be. These
 * helpers deliberately know nothing about React or the viewport so filtering,
 * themes, and projection changes cannot subtly change a model's standing.
 */

import type {
  LeaderboardClientRow,
  LeaderboardRow,
  LeaderboardScope,
} from "@/lib/data";
import type { RankScope } from "@/lib/categories";
import type { Model } from "@/lib/schema";

export type PlotModel = Pick<
  Model,
  "id" | "name" | "lab" | "openWeights" | "pricing"
>;

export type PlotScope = Pick<
  LeaderboardScope,
  "index" | "rank" | "rankedFieldSize"
>;

/**
 * The exact server-to-client contract needed by the price plot.
 *
 * Keeping this deliberately smaller than LeaderboardRow prevents the
 * stand-alone /value route from serializing every benchmark score, citation,
 * ramp and reasoning label simply to draw two coordinates.
 */
export type PlotRow = {
  model: PlotModel;
  scopes: LeaderboardClientRow["scopes"];
};

/**
 * Static-route wire format for one selected scope. The homepage already owns
 * every scope for sorting, but /value needs only Overall; sending five named
 * scope objects there repeated the same keys 310 times in the Flight stream.
 */
export type PlotPayloadRow = readonly [
  id: string,
  name: string,
  lab: string,
  openWeights: 0 | 1,
  inputPrice: number | null,
  outputPrice: number | null,
  index: number | null,
  rank: number | null,
  rankedFieldSize: number,
];

export type PlotPayload = readonly PlotPayloadRow[];

export type ScopedPlotRow = {
  model: PlotModel;
  scope: PlotScope;
};

export function toPlotRows(
  rows: readonly Pick<LeaderboardRow, "model" | "scopes">[],
): PlotRow[] {
  return rows.map(({ model, scopes }) => ({
    model: {
      id: model.id,
      name: model.name,
      lab: model.lab,
      openWeights: model.openWeights,
      ...(model.pricing === undefined ? {} : { pricing: model.pricing }),
    },
    scopes,
  }));
}

export function toPlotPayload(
  rows: readonly Pick<LeaderboardRow, "model" | "scopes">[],
  scope: RankScope,
): PlotPayload {
  return rows.map(({ model, scopes }) => [
    model.id,
    model.name,
    model.lab,
    model.openWeights ? 1 : 0,
    model.pricing?.input ?? null,
    model.pricing?.output ?? null,
    scopes[scope].index,
    scopes[scope].rank,
    scopes[scope].rankedFieldSize,
  ]);
}

export function expandPlotPayload(payload: PlotPayload): ScopedPlotRow[] {
  return payload.map(
    ([
      id,
      name,
      lab,
      openWeights,
      inputPrice,
      outputPrice,
      index,
      rank,
      rankedFieldSize,
    ]) => ({
      model: {
        id,
        name,
        lab,
        openWeights: openWeights === 1,
        ...(inputPrice === null || outputPrice === null
          ? {}
          : { pricing: { input: inputPrice, output: outputPrice } }),
      },
      scope: { index, rank, rankedFieldSize },
    }),
  );
}

export type ValuePoint<T> = {
  id: string;
  item: T;
  price: number;
  index: number;
};

export type Distribution = {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  percentile: number;
};

function quantile(sorted: readonly number[], fraction: number) {
  if (sorted.length === 1) return sorted[0];

  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function distributionFor(
  values: readonly number[],
  selected: number,
): Distribution | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0 || !Number.isFinite(selected)) return null;

  const below = sorted.filter((value) => value < selected).length;
  const equal = sorted.filter((value) => value === selected).length;

  return {
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted.at(-1)!,
    // Midrank percentile: exact ties receive the same field position.
    percentile: ((below + equal / 2) / sorted.length) * 100,
  };
}

/**
 * IDs on the lower-price / higher-index Pareto frontier.
 *
 * A dominates B when its price is no higher and its Index is no lower, with at
 * least one strict inequality. Equal-price points are grouped before the scan:
 * only that price's maximum Index can advance the frontier, while exact
 * price/Index ties remain efficient together.
 */
export function efficientFrontier<T>(
  candidates: readonly ValuePoint<T>[],
): Set<string> {
  const valid = [...candidates]
    .filter(
      ({ price, index }) =>
        Number.isFinite(price) && price >= 0 && Number.isFinite(index),
    )
    .sort((a, b) => a.price - b.price || b.index - a.index);
  const byPrice = new Map<number, ValuePoint<T>[]>();

  for (const candidate of valid) {
    const group = byPrice.get(candidate.price) ?? [];
    group.push(candidate);
    byPrice.set(candidate.price, group);
  }

  const result = new Set<string>();
  let bestAtCheaperPrice = -Infinity;

  for (const [, group] of [...byPrice].sort(([a], [b]) => a - b)) {
    const bestAtThisPrice = Math.max(...group.map(({ index }) => index));

    if (bestAtThisPrice > bestAtCheaperPrice) {
      for (const candidate of group) {
        if (candidate.index === bestAtThisPrice) result.add(candidate.id);
      }
    }

    bestAtCheaperPrice = Math.max(bestAtCheaperPrice, bestAtThisPrice);
  }

  return result;
}

export function normalizeToRange(value: number, min: number, max: number) {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return 0;
  }
  if (max <= min) return 1;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
