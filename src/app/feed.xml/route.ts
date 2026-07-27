import { loadLeaderboardData } from "@/lib/data";
import { formatScore } from "@/lib/format";
import { modelRecordFreshness, siteUrl } from "@/lib/site";

export const dynamic = "force-static";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * A current per-model snapshot, not an event log. Each stable entry is ordered
 * by the newest score retrieval represented on that record; a scoreless model
 * uses its release date. Calling these entries "changes" would claim a diff the
 * dataset does not store.
 */
export function GET() {
  const data = loadLeaderboardData();

  const entries = data.rows
    .map((row) => {
      const freshness = modelRecordFreshness(row);
      return { row, freshness };
    })
    .sort(
      (left, right) =>
        right.freshness.lastModified.localeCompare(
          left.freshness.lastModified,
        ) || left.row.model.name.localeCompare(right.row.model.name, "en"),
    );

  const items = entries
    .map(({ row, freshness }) => {
      const index = row.scopes.overall.index;
      const standing =
        index === null
          ? "Not enough benchmark coverage to be ranked."
          : `Overall Index ${formatScore(index)}${row.scopes.overall.rank ? `, rank ${row.scopes.overall.rank} of ${row.scopes.overall.rankedFieldSize}` : ""}. ${row.scopes.overall.coverageCount} of ${row.scopes.overall.coverageTotal} benchmarks measured.`;
      const evidence = freshness.latestScoreRetrieved
        ? ` Newest score retrieval: ${freshness.latestScoreRetrieved}.`
        : " No measured benchmark score is stored for this model.";

      return `    <entry>
      <title>${escapeXml(row.model.name)}</title>
      <link href="${siteUrl}/model/${row.model.id}"/>
      <id>${siteUrl}/model/${row.model.id}</id>
      <updated>${freshness.lastModified}T00:00:00Z</updated>
      <summary>${escapeXml(`${row.model.name} by ${row.model.lab}. ${standing}${evidence}`)}</summary>
    </entry>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>LM Board — model data feed</title>
  <link href="${siteUrl}/feed.xml" rel="self"/>
  <link href="${siteUrl}/"/>
  <id>${siteUrl}/feed.xml</id>
  <updated>${data.lastUpdated}T00:00:00Z</updated>
  <author>
    <name>LM Board</name>
    <uri>${siteUrl}</uri>
  </author>
  <icon>${siteUrl}/icon-192.png</icon>
  <logo>${siteUrl}/og/home.png?v=${data.lastUpdated}</logo>
  <rights>LM Board dataset arrangement: CC BY 4.0. Source measurements retain their own terms.</rights>
  <subtitle>One current entry per model, ordered by its newest score retrieval date; scoreless models use release date.</subtitle>
${items}
</feed>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
}
