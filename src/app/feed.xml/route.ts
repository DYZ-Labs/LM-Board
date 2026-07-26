import { loadLeaderboardData } from "@/lib/data";
import { formatScore } from "@/lib/format";
import { siteUrl } from "@/lib/site";

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
 * The lowest-friction way back to the board: a change feed that needs no email
 * capture, no cookie, and no CSP change. One entry per model, ordered by the
 * most recent retrieval date, so a reader's client shows what moved.
 */
export function GET() {
  const data = loadLeaderboardData();

  const entries = data.rows
    .map((row) => {
      const retrieved = Object.values(row.scoresByBenchmark)
        .filter((score) => score != null)
        .map((score) => score!.source.retrieved)
        .sort()
        .at(-1);

      return { row, retrieved: retrieved ?? row.model.releaseDate };
    })
    .sort((left, right) => right.retrieved.localeCompare(left.retrieved))
    .slice(0, 50);

  const items = entries
    .map(({ row, retrieved }) => {
      const index = row.scopes.overall.index;
      const standing =
        index === null
          ? "Not enough benchmark coverage to be ranked."
          : `Overall Index ${formatScore(index)}${row.scopes.overall.rank ? `, rank ${row.scopes.overall.rank}` : ""}. ${row.coverageCount} of ${row.coverageTotal} benchmarks measured.`;

      return `    <entry>
      <title>${escapeXml(row.model.name)}</title>
      <link href="${siteUrl}/model/${row.model.id}"/>
      <id>${siteUrl}/model/${row.model.id}</id>
      <updated>${retrieved}T00:00:00Z</updated>
      <author><name>${escapeXml(row.model.lab)}</name></author>
      <summary>${escapeXml(standing)}</summary>
    </entry>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>LM Board — score changes</title>
  <link href="${siteUrl}/feed.xml" rel="self"/>
  <link href="${siteUrl}/"/>
  <id>${siteUrl}/</id>
  <updated>${data.lastUpdated}T00:00:00Z</updated>
  <subtitle>Curated frontier-model benchmark scores, newest retrievals first.</subtitle>
${items}
</feed>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
}
