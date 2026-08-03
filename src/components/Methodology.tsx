import { ExternalIcon } from "@/components/Icon";
import {
  BENCHMARK_CATEGORIES,
  rankScopeLabel,
} from "@/lib/categories";
import { loadLeaderboardData } from "@/lib/data";
import { formatCount } from "@/lib/format";
import type { Benchmark } from "@/lib/schema";

type MethodologyProps = {
  benchmarks: Benchmark[];
  percentBenchmarkCount: number;
  minimumCoverageCount: number;
  issuesUrl: string | null;
};

// Illustrative four-benchmark Overall suite: coverage is ceil(4 × 0.6) = 3.
// Model B sits at the midpoint of the three benchmarks it was measured on, so
// its Bench 2 gap is estimated at the midpoint of Bench 2: (90.0 + 96.0) / 2.
const EXAMPLE_BENCHMARKS = ["Bench 1", "Bench 2", "Bench 3", "Bench 4"];

function joinNames(names: string[]) {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

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
  const benchmarkGroups = BENCHMARK_CATEGORIES.map((category) => ({
    category,
    label: rankScopeLabel(category),
    benchmarks: benchmarks.filter(
      (benchmark) => benchmark.category === category,
    ),
  })).filter((group) => group.benchmarks.length > 0);
  // Read back out of the dataset rather than written down: the page's job is
  // to be checkable, and a hand-typed count is the one thing on it a reader
  // cannot check against the board.
  const { rows, scoreCount, selfReportedCount } = loadLeaderboardData();
  const scoresWithSettings = rows.reduce(
    (total, row) =>
      total +
      Object.values(row.scoresByBenchmark).filter((score) => score?.settings)
        .length,
    0,
  );
  const unpricedCount = rows.filter((row) => !row.model.pricing).length;
  const singleBenchmarkTabs = joinNames(
    benchmarkGroups
      .filter((group) => group.benchmarks.length === 1)
      .map((group) => group.label),
  );

  return (
    <section
      className="longform"
      id="methodology"
      aria-label="Methodology"
    >
      <div className="longform-intro">
        <h1>Methodology</h1>
        <p>
          LM Board runs no evaluations. It records benchmark scores published
          by their named source &mdash; today, all{" "}
          {formatCount(scoreCount)} measured scores are published by Artificial
          Analysis &mdash; then computes one equal-weight Index per category.
          Every measured score keeps a source link, retrieval date, and any
          available evaluation settings. Missing benchmark results are
          estimated only inside the Index and are disclosed as estimates. An
          Overall rank requires 60% measured coverage; clearing that broad
          evidence gate also permits complete estimated category Indexes.
        </p>
      </div>

      <div className="method-sections">
        <article className="method-section">
          <header className="method-rail">
            <h2>Where the scores come from</h2>
          </header>
          <div className="method-body">
            <p>
              All {formatCount(scoreCount)} scores on the board carry a source
              link and the date they were retrieved
              {scoresWithSettings === scoreCount
                ? ", and every one records the settings it was run under"
                : `, and ${formatCount(scoresWithSettings)} of them record the settings they were run under`}
              . The link and the date are required by the data schema, so a
              result that arrives without both is rejected at build time rather
              than published unsourced. Open any model record from the
              leaderboard to read them.
            </p>
            <p>
              Third-party measurements are preferred over a lab&apos;s own
              reporting.{" "}
              {selfReportedCount === 0 ? (
                <>
                  Today none of the {formatCount(scoreCount)} scores on the
                  board are self-reported &mdash; every one is an{" "}
                  <a
                    className="link-external"
                    href="https://artificialanalysis.ai/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Artificial Analysis <ExternalIcon className="ext" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>{" "}
                  measurement. A score that did come from the model&apos;s maker
                  would stay on the board and carry a{" "}
                  <span className="vendor-term">Vendor</span> mark next to the
                  number.
                </>
              ) : (
                <>
                  {formatCount(selfReportedCount)} of the{" "}
                  {formatCount(scoreCount)} scores on the board came from the
                  model&apos;s maker and carry a{" "}
                  <span className="vendor-term">Vendor</span> mark next to the
                  number; the rest are{" "}
                  <a
                    className="link-external"
                    href="https://artificialanalysis.ai/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Artificial Analysis <ExternalIcon className="ext" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>{" "}
                  measurements.
                </>
              )}
            </p>
            {/* The provenance guarantee is about scores, and saying so is only
                honest if the page also says what the other numerals are. */}
            <p>
              Price, context window and release date are not benchmark results
              and are not sourced the same way: they come from the
              provider&apos;s own public listing, linked as{" "}
              <em>Official page</em> on every model record, and carry no
              separate retrieval date.
              {unpricedCount > 0
                ? ` ${formatCount(unpricedCount)} of the ${formatCount(rows.length)} models on the board publish no price at all, and show a dash rather than a zero.`
                : null}
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
              estimated. A category Index may be entirely estimated when a
              broadly measured model has no result in that category; it is
              labeled as estimated rather than presented as a measurement.
            </p>
            <figure className="method-example">
              {/* A scroll container needs to be reachable without a pointer;
                  the <caption> already names the content, so the region label
                  stays short. */}
              <div
                className="method-example-scroll"
                role="region"
                tabIndex={0}
                aria-label="Worked example of the Index calculation"
              >
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
                            /* aria-label on a plain <span> is prohibited by
                               ARIA 1.2 — role=generic supports no name. */
                            <span className="missing-value">
                              <span aria-hidden="true">&mdash;</span>
                              <span className="sr-only">Unranked</span>
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
                An illustrative Overall suite with four benchmarks, where
                ranking requires three. Model B ranks first on the strength of the three
                benchmarks it was measured on; its Bench 2 gap is estimated at
                the level it performs elsewhere, so the omission is neither a
                penalty nor a free pass. Model C scores well but covers only two
                of four benchmarks, so it keeps its scores and gets no rank
                &mdash; and no estimates.
              </figcaption>
            </figure>
            <p>
              Each tab &mdash; Overall, Reasoning, Coding, Math, and Agentic
              &mdash; applies the same average to its own set of benchmarks, and
              the tabs are not the same size.
              {singleBenchmarkTabs
                ? ` Where a category has a single benchmark — ${singleBenchmarkTabs} today — the Index is that benchmark's measured score when available, or a disclosed estimate for a model that cleared the Overall evidence gate.`
                : null}
            </p>
          </div>
        </article>

        <article className="method-section">
          <header className="method-rail">
            <h2>Who gets ranked: the 60% rule</h2>
          </header>
          <div className="method-body">
            <p>
              Broad evidence comes first. An Overall rank requires measured
              scores on at least 60% of the full suite &mdash; currently{" "}
              {minimumCoverageCount} of {percentBenchmarkCount}. Once a model
              clears that gate, every category can receive a complete Index:
              measured category scores are used directly and every remaining
              gap is estimated from the model&apos;s standing across its measured
              benchmarks. A model that has not cleared Overall can still rank
              in a category by measuring at least 60% of that category.
            </p>
            <p>
              If a model clears neither route, it still appears with every
              measured score but shows &ldquo;Insufficient data&rdquo; and no
              rank. Estimates never become score records, and an incomplete
              estimated Index is rejected. This keeps sparse evidence from
              becoming a free pass while allowing broadly tested models to be
              compared across every category.
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
            <p>
              They do not share a difficulty, though, so a bar drawn as a
              fraction of 100 would compare benchmarks rather than models. The
              bar under each score instead shows where that score falls within
              the range the benchmark has actually produced across every model
              on the board.
            </p>
            <div className="method-benchlist">
              {benchmarkGroups.map((group) => (
                <div className="method-benchgroup" key={group.category}>
                  <h3>{group.label}</h3>
                  <ul>
                    {group.benchmarks.map((benchmark) => (
                      <li
                        id={`benchmark-${benchmark.id}`}
                        key={benchmark.id}
                      >
                        <span className="bench-name">{benchmark.name}</span>
                        <span className="bench-desc">
                          {benchmark.description}
                        </span>
                        <a
                          className="link-external"
                          href={benchmark.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source <ExternalIcon className="ext" />
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
              Published scores can use different tools, prompting setups, and
              reasoning budgets. The board does not publish confidence
              intervals, so small gaps should not be treated as proof of a
              meaningful capability difference. When a model row shows a
              reasoning-effort label, that setting applies to every score in
              the row.
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
          <a
            className="link-external"
            href={issuesUrl}
            target="_blank"
            rel="noreferrer"
          >
            Suggest a correction on GitHub <ExternalIcon className="ext" />
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
