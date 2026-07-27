import { ExternalIcon } from "@/components/Icon";
import { loadLeaderboardData } from "@/lib/data";
import { formatCount } from "@/lib/format";

type ProvenanceRibbonProps = {
  scoreCount: number;
  modelCount: number;
  benchmarkCount: number;
};

/**
 * The product's thesis, stated before the board rather than in the footer.
 *
 * The old line claimed "every number links to its source", which a sceptic
 * falsified by looking one column to the right: prices, context windows and
 * release dates come from a provider's listing and carry no retrieval date at
 * all. The claim now names scores, which makes it true — and true is also the
 * stronger claim, because what it can then say about those scores (every one
 * independently measured, every one carrying the settings it was run under) is
 * the part the old copy gave away for nothing.
 *
 * The qualifying facts are read back out of the dataset rather than written
 * down, so a self-reported score arriving in data/scores.json rewrites the
 * sentence instead of falsifying it.
 *
 * The closing clause exists because the claim was still only demonstrable at
 * one viewport. Below 1440 the board falls back to the profile projection,
 * where the magnitude bars are deliberately not links — eight 5x22px anchors a
 * row is 440 target-size failures and 456 tab stops — so the numerals a visitor
 * can see are not the thing carrying the citation. The route that does exist
 * everywhere is the model's evidence record, and a claim nobody can find is
 * worth no more than one that is false, so the sentence now names it.
 */
export function ProvenanceRibbon({
  scoreCount,
  modelCount,
  benchmarkCount,
}: ProvenanceRibbonProps) {
  const { rows, selfReportedCount } = loadLeaderboardData();
  const vendorScoreCount = Math.min(scoreCount, selfReportedCount);
  const artificialAnalysisScoreCount = scoreCount - vendorScoreCount;
  const scoresWithSettings = rows.reduce(
    (total, row) =>
      total +
      Object.values(row.scoresByBenchmark).filter((score) => score?.settings)
        .length,
    0,
  );
  const separator = <span className="sep" aria-hidden="true" />;

  return (
    <details className="provenance-ribbon">
      <summary>
        {/* The separators are decorative dots, so each is padded with real
            whitespace; otherwise assistive text runs "scoresmodels". */}
        <span className="provenance-counts">
          <strong>{formatCount(scoreCount)}</strong> scores {separator}{" "}
          <strong>{formatCount(modelCount)}</strong> models {separator}{" "}
          <strong>{benchmarkCount}</strong> benchmarks
        </span>
        <span className="provenance-summary">
          Source-linked scores · LM Board computes the Index
        </span>
      </summary>
      <div className="provenance-detail">
        <p>
          LM Board runs no evaluations.{" "}
          <a
            className="link link-external"
            href="https://artificialanalysis.ai/"
            target="_blank"
            rel="noreferrer"
          >
            Artificial Analysis <ExternalIcon className="ext" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>{" "}
          publishes {formatCount(artificialAnalysisScoreCount)} of the{" "}
          {formatCount(scoreCount)} benchmark scores
          {vendorScoreCount === 0
            ? "; no scores are vendor-published."
            : `; model vendors publish ${formatCount(vendorScoreCount)}, each marked Vendor.`}{" "}
          LM Board computes the Index and ranks from those published scores.
        </p>
        <p>
          <span className="provenance-claim">
            Every score links to the measurement it came from
          </span>
          , with the date it was retrieved
          {scoresWithSettings === scoreCount
            ? " and the settings it was run under"
            : null}
          . Every model name opens its complete citation record; where the full
          table fits, score numerals open their source details directly.
        </p>
      </div>
    </details>
  );
}
