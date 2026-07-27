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
 * The step is the coarse reading (which fifth of the field) and `rampFill` is
 * the fine one (where in the field), both against the same benchmark.
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

/** The measured spread of one benchmark, over every score in the dataset. */
export type ScoreDomain = { readonly min: number; readonly max: number };

/**
 * Smallest fill a bar may draw, so the field's weakest result is still a mark
 * rather than an absence — a score of zero height is indistinguishable from a
 * missing score, which is the one thing this product may never blur.
 */
export const MIN_FILL = 0.04;

/**
 * 0–1 fill for the bar, scaled to the benchmark's *own* measured field rather
 * than to the 0–100 scale it happens to be reported on.
 *
 * Against 0–100 the mark encoded difficulty instead of standing: every GPQA bar
 * ran 59–94% full and no CritPt bar ever passed 32%, so a row of eight bars drew
 * the shape of the benchmark suite and redrew it identically for all 62 models.
 * Measured over the 38 models with a complete row, between-benchmark spread was
 * 1.94x between-model spread; against the domain it is 0.63.
 *
 * The domain is the whole dataset's, not the filtered board's — otherwise the
 * same score would draw a different length once a lab filter was applied.
 */
export function rampFill(value: number, domain: ScoreDomain | undefined): number {
  if (!domain) return 1;

  const span = domain.max - domain.min;
  if (span <= 0) return 1;

  return Math.min(1, Math.max(MIN_FILL, (value - domain.min) / span));
}
