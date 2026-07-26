import Link from "next/link";

import { Badge } from "@/components/Badge";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ExternalIcon } from "@/components/Icon";
import type { LeaderboardRow } from "@/lib/data";
import { formatCount, formatDate, formatPrice, formatScore } from "@/lib/format";
import type { Benchmark } from "@/lib/schema";

type DetailPanelProps = {
  row: LeaderboardRow;
  benchmarks: Benchmark[];
  colSpan: number;
};

/**
 * A preview of /model/[id]. The full, linkable record lives on its own route;
 * this panel exists so a comparison can be made without leaving the board.
 */
export function DetailPanel({ row, benchmarks, colSpan }: DetailPanelProps) {
  const { model } = row;

  return (
    <tr className="detail-row" id={`details-${model.id}`}>
      <td colSpan={colSpan}>
        <section className="detail-panel" aria-label={`${model.name} details`}>
          <div className="detail-heading">
            <div>
              <p className="detail-eyebrow">Model record</p>
              <h2>{model.name}</h2>
            </div>
            <div className="detail-actions">
              <CopyLinkButton
                href={`/model/${model.id}`}
                label="Copy link"
                confirmation={`Link to ${model.name} copied`}
              />
              <Link className="btn" href={`/model/${model.id}`}>
                Full record
              </Link>
              <a
                className="btn link-external"
                href={model.url}
                target="_blank"
                rel="noreferrer"
              >
                Official page <ExternalIcon className="ext" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
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
                  ? `${formatCount(model.contextWindow)} tokens`
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
                  ? `$${formatPrice(model.pricing.input)} in · $${formatPrice(model.pricing.output)} out`
                  : "Not listed"}
              </dd>
            </div>
            <div>
              <dt>Index coverage</dt>
              <dd>
                {row.coverageCount} of {row.coverageTotal} measured (
                {Math.round(row.coverageRatio * 100)}%)
                {row.estimatedCount > 0
                  ? `; ${row.estimatedCount} estimated`
                  : null}
              </dd>
            </div>
          </dl>

          <div className="detail-scores">
            <h3>Score provenance</h3>
            <div className="detail-score-grid">
              {benchmarks.map((benchmark) => {
                const score = row.scoresByBenchmark[benchmark.id];

                return (
                  <article className="detail-score" key={benchmark.id}>
                    <div className="detail-score-heading">
                      <h4>{benchmark.name}</h4>
                      <strong className="num">
                        {score ? formatScore(score.value) : "—"}
                      </strong>
                    </div>
                    {score ? (
                      <>
                        {score.selfReported ? (
                          <Badge tone="warn">Self-reported measurement</Badge>
                        ) : null}
                        <p>
                          <strong>Settings:</strong>{" "}
                          {score.settings ?? "Not specified."}
                        </p>
                        <p className="source-line">
                          <a
                            className="link-external"
                            href={score.source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View score source <ExternalIcon className="ext" />
                            <span className="sr-only">
                              {" "}
                              (opens in a new tab)
                            </span>
                          </a>
                          <span>
                            Retrieved {formatDate(score.source.retrieved)}
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="missing-value">
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
