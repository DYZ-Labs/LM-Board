import Link from "next/link";
import type { CSSProperties } from "react";

import { formatScore } from "@/lib/format";
import { rampFill, type ScoreDomain } from "@/lib/ramp";
import type { LeaderboardClientRow } from "@/lib/data";
import type { Benchmark } from "@/lib/schema";

type ScoreSparkProps = {
  row: LeaderboardClientRow;
  benchmarks: Benchmark[];
  domains: Record<string, ScoreDomain>;
};

/**
 * The profile projection's magnitude column: one bar per benchmark, scaled to
 * that benchmark's own measured field and shaded by the same luminance ramp the
 * board uses everywhere else.
 *
 * The bars are not links. Each was a 5x22px target — 440 WCAG 2.5.8 failures on
 * one page — and the halo that would fix it has to stay under 9px or it reaches
 * into the rows above and below and steals their taps, so the guarantee could
 * not be made at this size. Eight anchors per row also put 456 tab stops
 * between a keyboard user and the row below.
 *
 * Provenance is not lost: every bar carries its benchmark and value in an
 * accessible name, and the profile is wrapped in one full-size link to the
 * model record's evidence table, where all sources retain their retrieval
 * dates. One reachable target per row instead of eight unreachable ones.
 */
export function ScoreSpark({ row, benchmarks, domains }: ScoreSparkProps) {
  return (
    <td className="spark-cell">
      <Link
        className="spark-link"
        href={`/model/${row.model.id}#record-scores`}
        prefetch={false}
        aria-label={`Benchmark profile for ${row.model.name}. Open the model evidence table.`}
      >
        <ul className="spark">
          {benchmarks.map((benchmark) => {
            const score = row.scoresByBenchmark[benchmark.id];
            const ramp = row.rampByBenchmark[benchmark.id];
            const style = {
              "--score-step": `var(--score-${ramp ?? 3})`,
              "--score-fill": score
                ? rampFill(score.value, domains[benchmark.id])
                : 0,
            } as CSSProperties;

            return (
              <li className="spark-slot" key={benchmark.id} style={style}>
                <span
                  className={`spark-bar${score ? "" : " is-missing"}`}
                  aria-hidden="true"
                />
                <span className="sr-only">
                  {benchmark.name}:{" "}
                  {score ? formatScore(score.value) : "not measured"}
                </span>
              </li>
            );
          })}
        </ul>
      </Link>
    </td>
  );
}
