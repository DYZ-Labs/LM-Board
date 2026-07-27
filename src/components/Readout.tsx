import Link from "next/link";

import { FreshnessChip } from "@/components/FreshnessChip";
import { ChevronRightIcon } from "@/components/Icon";
import { ReadoutField } from "@/components/ReadoutField";
import { loadLeaderboardData, type LeaderboardRow } from "@/lib/data";
import { formatScore } from "@/lib/format";

type ReadoutProps = {
  leader: LeaderboardRow | null;
  lastUpdated: string;
};

/**
 * The page title and the board's top answer, before the visitor does any work.
 * The field ruler is the same data-derived motif used by the site's share
 * cards: every tick is a ranked model and every height is its Overall Index.
 * It makes the leader legible in context without inventing a decorative chart.
 */
export function Readout({
  leader,
  lastUpdated,
}: ReadoutProps) {
  const overall = leader?.scopes.overall;
  const field = loadLeaderboardData()
    .rows.flatMap((row) => {
      const { index, rank } = row.scopes.overall;

      return index === null
        ? []
        : [
            {
              index,
              name: row.model.name,
              rank,
            },
          ];
    })
    .toSorted(
      (a, b) =>
        b.index - a.index || a.name.localeCompare(b.name, "en"),
    );
  const fieldData = field
    .map(({ index, name, rank }) =>
      [
        rank ?? "",
        name.replace(/[\t\n]/g, " "),
        index,
      ].join("\t"),
    )
    .join("\n");

  return (
    <section className="readout" aria-labelledby="leaderboard-heading">
      <div className="readout-heading">
        <p className="readout-kicker">LLM Leaderboard</p>
        <h1 className="readout-title" id="leaderboard-heading">
          Benchmark Scores for <span>Frontier AI Models</span>
        </h1>
      </div>

      <FreshnessChip date={lastUpdated} />

      {!leader || !overall || overall.index === null ? (
        <div className="readout-empty">
          <p className="readout-eyebrow">Current leader</p>
          <p className="readout-lab">
            No model currently clears the coverage threshold for an Overall
            Index.
          </p>
        </div>
      ) : (
        <div className="readout-leader">
          <div className="readout-identity">
            <p className="readout-eyebrow">Current leader</p>
            <h2 className="readout-name">
              <Link href={`/model/${leader.model.id}`} prefetch={false}>
                {leader.model.name}
              </Link>
            </h2>
            <p className="readout-lab">{leader.model.lab}</p>
            <div className="readout-actions">
              <Link
                className="btn btn-primary readout-record"
                href={`/model/${leader.model.id}`}
                prefetch={false}
              >
                See why it ranks #1
                <ChevronRightIcon />
              </Link>
              <Link
                className="link readout-more"
                href="/methodology"
                prefetch={false}
              >
                How rankings work
              </Link>
            </div>
          </div>

          <div className="readout-score">
            <p className="readout-score-label">Overall Index</p>
            <p className="readout-value num">{formatScore(overall.index)}</p>
            <p className="readout-field-position num">
              #{overall.rank ?? "—"} of {overall.rankedFieldSize} models
            </p>
          </div>

          {field.length > 0 ? <ReadoutField data={fieldData} /> : null}
        </div>
      )}
    </section>
  );
}
