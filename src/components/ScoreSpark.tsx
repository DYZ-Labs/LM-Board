import type { CSSProperties } from "react";

import { formatScore } from "@/lib/format";
import { rampFill } from "@/lib/ramp";
import type { LeaderboardRow } from "@/lib/data";
import type { Benchmark } from "@/lib/schema";

type ScoreSparkProps = {
  row: LeaderboardRow;
  benchmarks: Benchmark[];
};

/**
 * The profile projection's magnitude column: one bar per benchmark, using the
 * same hue ramp as the table's score cells.
 *
 * This is never the only encoding. The numbers live one control away in the
 * table projection, and the sr-only list below carries every value verbatim,
 * so nothing here is conveyed by colour or size alone.
 */
export function ScoreSpark({ row, benchmarks }: ScoreSparkProps) {
  return (
    <td className="spark-cell">
      <div className="spark" aria-hidden="true">
        {benchmarks.map((benchmark) => {
          const score = row.scoresByBenchmark[benchmark.id];
          const ramp = row.rampByBenchmark[benchmark.id];
          const style = {
            "--score-step": `var(--score-${ramp ?? 3})`,
            "--score-fill": score ? rampFill(score.value) : 0,
          } as CSSProperties;

          return (
            <span
              key={benchmark.id}
              className={`spark-bar${score ? "" : " is-missing"}`}
              style={style}
              title={
                score
                  ? `${benchmark.name}: ${formatScore(score.value)}`
                  : `${benchmark.name}: no curated score`
              }
            />
          );
        })}
      </div>
      <ul className="sr-only">
        {benchmarks.map((benchmark) => {
          const score = row.scoresByBenchmark[benchmark.id];

          return (
            <li key={benchmark.id}>
              {benchmark.name}:{" "}
              {score ? formatScore(score.value) : "no curated score"}
            </li>
          );
        })}
      </ul>
    </td>
  );
}
