import { formatDate } from "@/lib/format";
import type { ChangeSummary } from "@/lib/changes";

type ChangeStripProps = {
  summary: ChangeSummary;
};

/**
 * The dataset's freshness, stated as the window it was collected in.
 *
 * It used to lead with "What's new — 7 scores retrieved on Jul 25", counting
 * only the last day of collection. That is the weakest true sentence available:
 * the whole board was retrieved inside nine days, and a reader who reads "7"
 * has been told the opposite of what the data supports. The label is gone with
 * it — the sentence says what it is.
 */
export function ChangeStrip({ summary }: ChangeStripProps) {
  const { oldestRetrieved, newestRetrieved, recentModels } = summary;

  return (
    <div className="change-strip">
      <p>
        {oldestRetrieved === newestRetrieved
          ? `Scores retrieved ${formatDate(newestRetrieved)}`
          : `Scores retrieved ${formatDate(oldestRetrieved)}–${formatDate(newestRetrieved)}`}{" "}
        {recentModels > 0
          ? `· ${recentModels} model${recentModels === 1 ? "" : "s"} released in the last 45 days`
          : null}
      </p>
    </div>
  );
}
