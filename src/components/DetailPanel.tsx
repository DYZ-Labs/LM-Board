import { Badge } from "@/components/Badge";
import type { LeaderboardRow } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import type { Benchmark } from "@/lib/schema";

const scoreFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

type DetailPanelProps = {
  row: LeaderboardRow;
  benchmarks: Benchmark[];
  colSpan: number;
};

export function DetailPanel({
  row,
  benchmarks,
  colSpan,
}: DetailPanelProps) {
  const { model } = row;

  return (
    <tr className="detail-row" id={`details-${model.id}`}>
      <td colSpan={colSpan}>
        <section
          className="detail-panel"
          aria-label={`${model.name} details`}
        >
          <div className="detail-heading">
            <div>
              <p className="detail-eyebrow">Model details</p>
              <h3>{model.name}</h3>
            </div>
            <a href={model.url} target="_blank" rel="noreferrer">
              Official model page
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>

          <dl className="model-metadata">
            <div>
              <dt>Provider</dt>
              <dd>{model.lab}</dd>
            </div>
            <div>
              <dt>Effort</dt>
              <dd>{row.reasoningEffort ?? "Not listed"}</dd>
            </div>
            <div>
              <dt>Released</dt>
              <dd>{formatDate(model.releaseDate)}</dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>
                {model.contextWindow
                  ? `${numberFormatter.format(model.contextWindow)} tokens`
                  : "Not listed"}
              </dd>
            </div>
            <div>
              <dt>Weights</dt>
              <dd>{model.openWeights ? "Open weights" : "Closed weights"}</dd>
            </div>
            <div>
              <dt>Price / Mtok</dt>
              <dd>
                {model.pricing
                  ? `$${formatPrice(model.pricing.input)} input · $${formatPrice(model.pricing.output)} output`
                  : "Not listed"}
              </dd>
            </div>
            <div>
              <dt>Index coverage</dt>
              <dd>
                {row.coverageCount} of {row.coverageTotal} benchmarks measured (
                {Math.round(row.coverageRatio * 100)}%)
                {row.estimatedCount > 0
                  ? `; ${row.estimatedCount} estimated for the Index`
                  : null}
              </dd>
            </div>
          </dl>

          <div className="detail-scores">
            <h4>Score provenance</h4>
            <div className="detail-score-grid">
              {benchmarks.map((benchmark) => {
                const score = row.scoresByBenchmark[benchmark.id];

                return (
                  <article className="detail-score" key={benchmark.id}>
                    <div className="detail-score-heading">
                      <h5>{benchmark.name}</h5>
                      <strong className="numeric-cell">
                        {score ? scoreFormatter.format(score.value) : "—"}
                      </strong>
                    </div>
                    {score ? (
                      <>
                        {score.selfReported ? (
                          <Badge className="measurement-label">
                            Self-reported measurement
                          </Badge>
                        ) : null}
                        <p>
                          <strong>Settings:</strong>{" "}
                          {score.settings ?? "Not specified."}
                        </p>
                        <p className="source-line">
                          <a
                            href={score.source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View score source
                            <span aria-hidden="true"> ↗</span>
                            <span className="sr-only">
                              {" "}(opens in a new tab)
                            </span>
                          </a>
                          <span>Retrieved {formatDate(score.source.retrieved)}</span>
                        </p>
                      </>
                    ) : (
                      <p className="missing-score-copy">
                        No curated score is currently available.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </td>
    </tr>
  );
}
