type MethodologyProps = {
  percentBenchmarkCount: number;
  minimumCoverageCount: number;
  issuesUrl: string | null;
};

export function Methodology({
  percentBenchmarkCount,
  minimumCoverageCount,
  issuesUrl,
}: MethodologyProps) {
  return (
    <section
      className="methodology"
      id="methodology"
      aria-labelledby="methodology-heading"
    >
      <div className="methodology-intro">
        <p className="section-kicker">Methodology</p>
        <h2 id="methodology-heading">Simple enough to audit.</h2>
        <p>
          LM Board curates published evaluations; it does not run benchmarks.
          Every displayed score keeps its source, retrieval date, and available
          evaluation settings one click away.
        </p>
      </div>

      <div className="methodology-grid">
        <article>
          <span className="method-number" aria-hidden="true">
            01
          </span>
          <h3>Equal-weight Index</h3>
          <p>
            The Index is the arithmetic mean of a model&apos;s available
            percent-scaled scores. Each benchmark has equal weight. Missing
            results are omitted—not treated as zero.
          </p>
          <p className="formula">
            Index = sum of available scores ÷ available benchmarks
          </p>
        </article>
        <article>
          <span className="method-number" aria-hidden="true">
            02
          </span>
          <h3>Coverage gate</h3>
          <p>
            A model ranks only after covering at least 60% of percent-scaled
            benchmarks: currently {minimumCoverageCount} of {percentBenchmarkCount}.
            Category tabs and filters never recalculate its canonical Index or
            rank.
          </p>
        </article>
        <article>
          <span className="method-number" aria-hidden="true">
            03
          </span>
          <h3>Provenance first</h3>
          <p>
            Canonical third-party measurements are preferred. Vendor-reported
            results remain visibly labeled. A displayed reasoning-effort label
            applies uniformly to every score in that model row. Scores with
            different tools, reasoning budgets, or harnesses may not be directly
            comparable.
          </p>
        </article>
      </div>

      <div className="methodology-note">
        <p>
          Results and provider pricing can change; linked sources remain authoritative.
        </p>
        {issuesUrl ? (
          <a href={issuesUrl} target="_blank" rel="noreferrer">
            Suggest a correction on GitHub
            <span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span>Corrections welcome; the issue tracker will be linked at publish time.</span>
        )}
      </div>
    </section>
  );
}
