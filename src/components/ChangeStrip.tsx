import { formatDate } from "@/lib/format";
import type { ChangeSummary } from "@/lib/changes";

type ChangeStripProps = {
  summary: ChangeSummary;
};

export function ChangeStrip({ summary }: ChangeStripProps) {
  const parts: string[] = [];

  if (summary.refreshedScores > 0) {
    parts.push(
      `${summary.refreshedScores} score${summary.refreshedScores === 1 ? "" : "s"} retrieved on ${formatDate(summary.lastUpdated)}`,
    );
  }
  if (summary.recentModels > 0) {
    parts.push(
      `${summary.recentModels} model${summary.recentModels === 1 ? "" : "s"} released in the last 45 days`,
    );
  }

  if (parts.length === 0) return null;

  return (
    <p className="change-strip">
      <strong>What&apos;s new</strong>
      <span>{parts.join(" · ")}</span>
      <a className="link" href="/feed.xml">
        Change feed
      </a>
    </p>
  );
}
