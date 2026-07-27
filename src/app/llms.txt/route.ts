import { loadLeaderboardData } from "@/lib/data";
import { formatCount, formatScore } from "@/lib/format";
import { coverageThreshold } from "@/lib/index";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

/**
 * The conversion action is to be the cited reference, and a growing share of
 * the citing is done by systems rather than people. This is the whole board in
 * the shape an answer engine can quote without parsing the leaderboard's DOM:
 * the Index definition, the coverage rule, the licence, and every model's
 * standing beside the URL that backs it.
 */
export function GET() {
  const data = loadLeaderboardData();
  const { minimumCoverageCount } = coverageThreshold(data.benchmarks);
  const artificialAnalysisCount = data.scoreCount - data.selfReportedCount;
  const ranked = [...data.rows].sort(
    (left, right) =>
      (right.scopes.overall.index ?? -1) - (left.scopes.overall.index ?? -1),
  );

  const models = ranked
    .map((row) => {
      const scope = row.scopes.overall;
      const standing =
        scope.index === null
          ? `not ranked (${scope.coverageCount} of ${scope.coverageTotal} benchmarks measured)`
          : `Index ${formatScore(scope.index)}, rank ${scope.rank} of ${scope.rankedFieldSize}`;

      return `- [${row.model.name}](${siteUrl}/model/${row.model.id}) (${row.model.lab}), ${standing}`;
    })
    .join("\n");

  const benchmarks = data.benchmarks
    .map(
      (benchmark) =>
        `- [${benchmark.name}](${benchmark.sourceUrl})`,
    )
    .join("\n");
  const scoreOwnership =
    data.selfReportedCount === 0
      ? `Artificial Analysis publishes all ${formatCount(data.scoreCount)} measured benchmark scores; none are vendor-reported.`
      : `Artificial Analysis publishes ${formatCount(artificialAnalysisCount)} of ${formatCount(data.scoreCount)} measured benchmark scores. The remaining ${formatCount(data.selfReportedCount)} are marked vendor-reported.`;

  const body = `# LM Board

> ${formatCount(data.rows.length)} frontier language models across ${data.benchmarks.length} benchmarks and ${formatCount(data.scoreCount)} measured scores. ${scoreOwnership} LM Board runs no evaluations. It computes the equal-weight Index and ranks from those scores.

Each measured score stores its source URL and retrieval date. Evaluation settings are included when available.

Newest score retrieval: ${data.lastUpdated}. Score retrieval window: ${data.oldestRetrieved} to ${data.lastUpdated}.

## The Index

LM Board computes the Overall Index as the equal-weight arithmetic mean of a model's values on the tracked benchmarks. A model is ranked only when at least ${minimumCoverageCount} of ${data.benchmarks.length} benchmarks are measured for it. Above that bar, remaining gaps are estimated at the model's measured percentile standing and disclosed as estimates; below it, gaps are never filled and the model carries no Index. Ranking is standard competition ranking, so models with an identical Index share a rank.

## Licensing and citation

LM Board contributors license their original selection, coordination, arrangement and annotations under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Third-party benchmark measurements are excluded from that license and remain subject to their source terms.

Suggested attribution: [LM Board dataset](${siteUrl}), by LM Board contributors, dataset as of ${data.lastUpdated}. Add the date you actually accessed the site when citing a retrieval date.

## Benchmarks

${benchmarks}

## Pages

- [Leaderboard](${siteUrl}/)
- [Price versus performance and the efficient frontier](${siteUrl}/value)
- [Methodology, in full](${siteUrl}/methodology)
- [Side-by-side comparison](${siteUrl}/compare)
- [Model data feed (Atom)](${siteUrl}/feed.xml)

## Models

${models}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
