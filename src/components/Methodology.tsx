import { Badge } from "@/components/Badge";
import type { Benchmark } from "@/lib/schema";

type MethodologyProps = {
  benchmarks: Benchmark[];
  percentBenchmarkCount: number;
  minimumCoverageCount: number;
  issuesUrl: string | null;
};

const CATEGORY_ORDER = [
  "reasoning",
  "coding",
  "math",
  "agentic",
] as const satisfies readonly Benchmark["category"][];

const CATEGORY_LABELS: Record<Benchmark["category"], string> = {
  reasoning: "Reasoning",
  coding: "Coding",
  math: "Math",
  agentic: "Agentic",
};

// Illustrative four-benchmark tab: coverage bar is ceil(4 × 0.6) = 3.
// Model B sits at the midpoint of the three benchmarks it was measured on, so
// its Bench 2 gap is estimated at the midpoint of Bench 2: (90.0 + 96.0) / 2.
const EXAMPLE_BENCHMARKS = ["Bench 1", "Bench 2", "Bench 3", "Bench 4"];

const EXAMPLE_ROWS: {
  rank: string | null;
  model: string;
  index: string | null;
  scores: ({ value: string; estimated?: boolean } | null)[];
}[] = [
  {
    rank: "1",
    model: "Model B",
    index: "87.8",
    scores: [
      { value: "92.0" },
      { value: "93.0", estimated: true },
      { value: "88.0" },
      { value: "78.0" },
    ],
  },
  {
    rank: "2",
    model: "Model A",
    index: "81.0",
    scores: [
      { value: "80.0" },
      { value: "90.0" },
      { value: "70.0" },
      { value: "84.0" },
    ],
  },
  {
    rank: null,
    model: "Model C",
    index: null,
    scores: [{ value: "95.0" }, { value: "96.0" }, null, null],
  },
];

export function Methodology({
  benchmarks,
  percentBenchmarkCount,
  minimumCoverageCount,
  issuesUrl,
}: MethodologyProps) {
  const benchmarkGroups = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    benchmarks: benchmarks.filter(
      (benchmark) => benchmark.category === category,
    ),
  })).filter((group) => group.benchmarks.length > 0);

  return (
    <section
      className="longform"
      id="methodology"
      aria-label="Methodology"
    >
      <div className="longform-intro">
        <h1>Methodology</h1>
        <p>
          LM Board runs no evaluations of its own. It collects scores that labs
          and independent evaluators have already published, puts them side by
          side, and averages them into one Index per model. Every number on the
          board links back to where it came from.
        </p>
      </div>

      <div className="method-sections">
        <article className="method-section">
          <header className="method-rail">
            <h2>Where the scores come from</h2>
          </header>
          <div className="method-body">
            <p>
              Every score is copied from a published result and stores two
              things alongside the number: a link to its source and the date it
              was retrieved. Open any model row on the leaderboard to see both,
              plus the evaluation settings when the source reports them.
            </p>
            <p>
              Independent measurements are preferred over a lab&apos;s own
              reporting; every score on the board today is measured
              independently by{" "}
              <a
                href="https://artificialanalysis.ai/"
                target="_blank"
                rel="noreferrer"
              >
                Artificial Analysis
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              . When a score does come from the model&apos;s maker, it stays
              on the board but carries the{" "}
              <Badge tone="warn">Vendor</Badge> mark you see
              next to scores in the table.
            </p>
          </div>
        </article>

        <article className="method-section">
          <header className="method-rail">
            <h2>How the Index is calculated</h2>
          </header>
          <div className="method-body">
            <p>
              A model&apos;s Index is the plain average of its scores across
              every benchmark on the tab. Every benchmark counts equally
              &mdash; no weighting, no Elo, no adjustments.
            </p>
            <p className="formula">
              Index = sum of a model&apos;s scores &divide; number of benchmarks
              on the tab
            </p>
            <p>
              Where a model has no result, the average uses an estimate rather
              than skipping the benchmark: the model&apos;s standing on the
              benchmarks it <em>was</em> measured on, read off the missing
              benchmark&apos;s own spread of published results. A model that
              ranks mid-field elsewhere is credited a mid-field result, so
              skipping a benchmark neither helps nor hurts. A missing score is
              never counted as zero, and an estimate is never published as a
              score &mdash; the table still shows &ldquo;&mdash;&rdquo; in that
              column, and the model row reports how many of its benchmarks were
              estimated.
            </p>
            <figure className="method-example">
              <div className="method-example-scroll">
                <table>
                  <caption className="sr-only">
                    Example of how the Index and ranks behave with missing
                    scores
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="example-rank">
                        Rank
                      </th>
                      <th scope="col" className="example-model">
                        Model
                      </th>
                      <th scope="col">Index</th>
                      {EXAMPLE_BENCHMARKS.map((name) => (
                        <th scope="col" key={name}>
                          {name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {EXAMPLE_ROWS.map((row) => (
                      <tr key={row.model}>
                        <td className="example-rank">
                          {row.rank ?? (
                            <span className="missing-value" aria-label="Unranked">
                              &mdash;
                            </span>
                          )}
                        </td>
                        <th scope="row" className="example-model">
                          {row.model}
                        </th>
                        <td className="example-index">
                          {row.index ?? (
                            <span className="text-tertiary">Insufficient data</span>
                          )}
                        </td>
                        {row.scores.map((score, scoreIndex) => (
                          <td
                            key={EXAMPLE_BENCHMARKS[scoreIndex]}
                            className={
                              score === null || score.estimated
                                ? "missing-value"
                                : undefined
                            }
                            aria-label={score === null ? "No score" : undefined}
                          >
                            {score === null ? (
                              <>&mdash;</>
                            ) : score.estimated ? (
                              <>
                                {score.value}
                                <span aria-hidden="true"> est.</span>
                                <span className="sr-only"> estimated</span>
                              </>
                            ) : (
                              score.value
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <figcaption>
                An illustrative tab with four benchmarks, where ranking requires
                three. Model B ranks first on the strength of the three
                benchmarks it was measured on; its Bench 2 gap is estimated at
                the level it performs elsewhere, so the omission is neither a
                penalty nor a free pass. Model C scores well but covers only two
                of four benchmarks, so it keeps its scores and gets no rank
                &mdash; and no estimates.
              </figcaption>
            </figure>
            <p>
              Each tab &mdash; Overall, Reasoning, Coding, Math, and Agentic
              &mdash; applies the same average to its own set of benchmarks.
            </p>
          </div>
        </article>

        <article className="method-section">
          <header className="method-rail">
            <h2>Who gets ranked: the 60% rule</h2>
          </header>
          <div className="method-body">
            <p>
              An average over two benchmarks says less than an average over
              eight, so a model is ranked only once it has scores on at least
              60% of a tab&apos;s benchmarks. On the Overall tab that is
              currently {minimumCoverageCount} of {percentBenchmarkCount}.
              Below that bar a model still appears with every score it has, but
              shows &ldquo;Insufficient data&rdquo; in place of an Index and
              &ldquo;&mdash;&rdquo; in place of a rank. Only measured results
              count toward the bar &mdash; estimates fill the gaps of a model
              that already cleared it, never carry a model over it. Without this
              rule, a model evaluated
              only on its strongest few benchmarks could top the table.
            </p>
            <p>
              Models with the same Index share the same rank, and the next
              distinct Index skips the ranks the tie used up &mdash; two models
              tied at 2nd are followed by a 4th, not a 3rd. Nothing outside the
              scores breaks a tie.
            </p>
            <p>
              Search and filters never change the numbers: they only hide rows,
              so a model keeps the same rank however the table is narrowed.
            </p>
          </div>
        </article>

        <article className="method-section">
          <header className="method-rail">
            <h2>The benchmarks</h2>
          </header>
          <div className="method-body">
            <p>
              The board currently tracks {benchmarks.length} benchmarks across
              four categories. All of them report scores on a 0&ndash;100
              scale, which is what makes a direct average possible; a benchmark
              on a different scale would still be displayed, but would stay out
              of the Index.
            </p>
            <div className="method-benchlist">
              {benchmarkGroups.map((group) => (
                <div className="method-benchgroup" key={group.category}>
                  <h3>{group.label}</h3>
                  <ul>
                    {group.benchmarks.map((benchmark) => (
                      <li key={benchmark.id}>
                        <span className="bench-name">{benchmark.name}</span>
                        <span className="bench-desc">
                          {benchmark.description}
                        </span>
                        <a
                          href={benchmark.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source<span aria-hidden="true"> &#8599;</span>
                          <span className="sr-only">
                            {" "}
                            (opens in a new tab)
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="method-section">
          <header className="method-rail">
            <h2>Honest limits</h2>
          </header>
          <div className="method-body">
            <p>
              Published scores are measured under different conditions &mdash;
              different tools, prompting setups, and reasoning budgets &mdash;
              so a small gap between two models is noise, not signal. When a
              model row shows a reasoning-effort label, that setting applies to
              every score in the row.
            </p>
          </div>
        </article>
      </div>

      <div className="methodology-note">
        <p>
          Results and provider pricing change as labs publish updates; the
          linked sources remain authoritative.
        </p>
        {issuesUrl ? (
          <a href={issuesUrl} target="_blank" rel="noreferrer">
            Suggest a correction on GitHub
            <span aria-hidden="true"> &#8599;</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span>
            Corrections welcome; the issue tracker will be linked at publish
            time.
          </span>
        )}
      </div>
    </section>
  );
}
