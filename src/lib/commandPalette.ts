import type {
  LeaderboardClientRow,
  LeaderboardRow,
} from "@/lib/data";
import type { Benchmark } from "@/lib/schema";

export type CommandPaletteModel = readonly [
  id: string,
  name: string,
  lab: string,
  overallRank: number | null,
];

export type CommandPaletteBenchmark = readonly [
  id: string,
  name: string,
  category: Benchmark["category"],
];

/**
 * Score-free server-to-client contract for global navigation.
 *
 * Model records and document routes need names, providers, standing and stable
 * destinations — never benchmark values, source URLs, pricing, or settings.
 * Tuples keep the repeated key overhead out of every static route's Flight
 * payload.
 */
export type CommandPalettePayload = readonly [
  models: readonly CommandPaletteModel[],
  benchmarks: readonly CommandPaletteBenchmark[],
];

type PaletteRow = Pick<LeaderboardRow | LeaderboardClientRow, "model" | "scopes">;
type PaletteBenchmark = Pick<Benchmark, "id" | "name" | "category">;

export function toCommandPalettePayload(
  rows: readonly PaletteRow[],
  benchmarks: readonly PaletteBenchmark[],
): CommandPalettePayload {
  return [
    rows.map(
      (row) =>
        [
          row.model.id,
          row.model.name,
          row.model.lab,
          row.scopes.overall.rank,
        ] as const,
    ),
    benchmarks.map(
      (benchmark) =>
        [
          benchmark.id,
          benchmark.name,
          benchmark.category,
        ] as const,
    ),
  ];
}
