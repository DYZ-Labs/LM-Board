import { percentileOf, type BenchmarkDistributions } from "@/lib/index";

/** Steps of the magnitude ramp, 1 (lowest) through 5 (highest). */
export type RampStep = 1 | 2 | 3 | 4 | 5;

export const RAMP_STEPS = 5;

/**
 * Maps a score to a luminance step by its standing *within its own benchmark*,
 * not its absolute value. Benchmarks differ enormously in difficulty — a 30 on
 * Humanity's Last Exam is a stronger result than a 60 on GPQA Diamond — so an
 * absolute ramp would paint whole columns uniformly dim and encode nothing.
 *
 * Bar length still encodes the absolute value (§4.2 M7), so a cell carries both
 * readings: how high the number is, and how it stands against its column.
 */
export function rampStep(
  distributions: BenchmarkDistributions,
  benchmarkId: string,
  value: number,
): RampStep {
  const sorted = distributions.get(benchmarkId);

  if (!sorted || sorted.length === 0) return 3;

  const percentile = percentileOf(sorted, value);
  const step = Math.min(RAMP_STEPS, Math.floor(percentile * RAMP_STEPS) + 1);

  return step as RampStep;
}

/** 0–1 fill for the bar. Percent benchmarks are already on a 0–100 scale. */
export function rampFill(value: number): number {
  return Math.min(1, Math.max(0, value / 100));
}
