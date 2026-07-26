import { formatCount } from "@/lib/format";

type ProvenanceRibbonProps = {
  scoreCount: number;
  modelCount: number;
  benchmarkCount: number;
};

/**
 * The product's thesis, stated before the board rather than in the footer.
 * Every count is derived from the loaded dataset, so it cannot drift from what
 * the table actually shows.
 *
 * The separators are decorative dots, so each is padded with real whitespace —
 * without it the text content runs together as "456 cited scores62 models" for
 * anyone listening rather than looking.
 */
export function ProvenanceRibbon({
  scoreCount,
  modelCount,
  benchmarkCount,
}: ProvenanceRibbonProps) {
  const separator = <span className="sep" aria-hidden="true" />;

  return (
    <p className="provenance-ribbon">
      <strong>{formatCount(scoreCount)}</strong> cited scores {separator}{" "}
      <strong>{formatCount(modelCount)}</strong> models {separator}{" "}
      <strong>{benchmarkCount}</strong> benchmarks {separator}{" "}
      <span className="provenance-claim">every number links to its source</span>{" "}
      {separator}{" "}
      <span>
        measured independently by{" "}
        <a
          className="link link-external"
          href="https://artificialanalysis.ai/"
          target="_blank"
          rel="noreferrer"
        >
          Artificial Analysis
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </span>
    </p>
  );
}
