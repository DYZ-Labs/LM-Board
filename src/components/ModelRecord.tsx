import Link from "next/link";

import { Badge } from "@/components/Badge";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { FieldStrip } from "@/components/FieldStrip";
import { ExternalIcon } from "@/components/Icon";
import { RANK_SCOPES, rankScopeLabel } from "@/lib/categories";
import type { LeaderboardRow } from "@/lib/data";
import {
  formatCount,
  formatDate,
  formatPrice,
  formatScore,
} from "@/lib/format";
import type { Benchmark } from "@/lib/schema";

type ModelRecordProps = {
  row: LeaderboardRow;
  benchmarks: Benchmark[];
};

/**
 * The citation surface. A permanent, linkable page per model carrying every
 * number with its source — the thing someone quoting this board should be
 * able to point at.
 */
export function ModelRecord({ row, benchmarks }: ModelRecordProps) {
  const { model } = row;
  const categoryScopes = RANK_SCOPES.filter(
    (scope) => scope !== "overall",
  );
  const categorySummary = categoryScopes
    .map((scope) => {
      const index = row.scopes[scope].index;
      return `${rankScopeLabel(scope)} ${index === null ? "not ranked" : formatScore(index)}`;
    })
    .join(", ");

  return (
    <article className="longform" id="record">
      <header className="record-header">
        <p className="section-kicker">Model record</p>
        <div className="record-title">
          <h1>{model.name}</h1>
          {row.reasoningEffortLabel ? (
            <Badge tone="neutral" title={row.reasoningEffort ?? undefined}>
              {row.reasoningEffortLabel}
            </Badge>
          ) : null}
          {model.openWeights ? <Badge tone="pos">Open weights</Badge> : null}
        </div>
        <p className="text-secondary">
          {model.lab} · released {formatDate(model.releaseDate)}
        </p>
        <nav className="row record-actions" aria-label="Model actions">
          <Link
            className="btn"
            href={`/compare?models=${model.id}`}
            prefetch={false}
          >
            Compare
          </Link>
          <Link
            className="btn"
            href="/choose"
            prefetch={false}
          >
            Find alternatives
          </Link>
          <a
            className="btn link-external"
            href={model.url}
            target="_blank"
            rel="noreferrer"
          >
            Provider page <ExternalIcon className="ext" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <CopyLinkButton
            surface="record"
            label="Copy link"
            confirmation={`Link to ${model.name} copied`}
          />
          <Link className="btn" href="/#leaderboard" prefetch={false}>
            Leaderboard
          </Link>
        </nav>
      </header>

      <section className="record-section" aria-labelledby="record-standing">
        <h2 id="record-standing">Overall standing</h2>
        <dl className="record-scopes record-scopes-primary">
          {(["overall"] as const).map((scope) => {
            const entry = row.scopes[scope];

            return (
              <div className="record-scope" key={scope}>
                <dt>{rankScopeLabel(scope)}</dt>
                {/* A <dl> group may only contain <dt> and <dd>; the coverage
                    note is a second <dd> rather than a <p>. */}
                <dd>
                  {entry.index === null ? (
                    <span className="rank-note">Insufficient data</span>
                  ) : (
                    <>
                      {formatScore(entry.index)}
                      {/* A rank with no denominator is not a fact anyone can
                          quote: rank 3 of 58 and rank 3 of 4 are different
                          claims. */}
                      <span className="rank-note">
                        {entry.rank === null
                          ? "unranked"
                          : `rank ${entry.rank} of ${entry.rankedFieldSize}`}
                      </span>
                    </>
                  )}
                </dd>
                {entry.rank === null ? null : (
                  <FieldStrip scope={scope} modelId={model.id} />
                )}
                <dd className="rank-note rank-coverage">
                  {entry.coverageCount} of {entry.coverageTotal} measured
                  {entry.estimatedCount > 0
                    ? ` · ${entry.estimatedCount} estimated`
                    : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <details className="record-disclosure record-section">
        <summary>
          <span>Category standings</span>
          <span
            className="record-summary-values record-category-summary"
            role="list"
            aria-label={`Category standings: ${categorySummary}`}
          >
            {categoryScopes.map((scope) => (
              <span
                className="record-summary-metric"
                role="listitem"
                key={scope}
              >
                <span>{rankScopeLabel(scope)}</span>
                {" "}
                <span className="num">
                  {row.scopes[scope].index === null
                    ? "—"
                    : formatScore(row.scopes[scope].index!)}
                </span>
              </span>
            ))}
          </span>
        </summary>
        <dl className="record-scopes record-scopes-secondary">
          {categoryScopes.map((scope) => {
            const entry = row.scopes[scope];

            return (
              <div className="record-scope" key={scope}>
                <dt>{rankScopeLabel(scope)}</dt>
                <dd>
                  {entry.index === null ? (
                    <span className="rank-note">Insufficient data</span>
                  ) : (
                    <>
                      {formatScore(entry.index)}
                      <span className="rank-note">
                        {entry.rank === null
                          ? "unranked"
                          : `rank ${entry.rank} of ${entry.rankedFieldSize}`}
                      </span>
                    </>
                  )}
                </dd>
                {entry.rank === null ? null : (
                  <FieldStrip scope={scope} modelId={model.id} />
                )}
                <dd className="rank-note rank-coverage">
                  {entry.coverageCount} of {entry.coverageTotal} measured
                  {entry.estimatedCount > 0
                    ? ` · ${entry.estimatedCount} estimated`
                    : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </details>

      <details className="record-disclosure record-section">
        <summary>
          <span>Model facts</span>
          <span className="record-summary-values">
            {model.openWeights ? "Open weights" : "Proprietary"} ·{" "}
            {model.pricing
              ? `$${formatPrice(model.pricing.input)} / $${formatPrice(model.pricing.output)} per 1M`
              : "Price not listed"}
          </span>
        </summary>
        <p className="record-facts-note">
          Model facts come from the provider page. Listed API prices carry a
          separate first-party source and check date.
        </p>
        <dl className="model-metadata" id="record-facts">
          <div>
            <dt>Provider</dt>
            <dd>{model.lab}</dd>
          </div>
          <div>
            <dt>Released</dt>
            <dd>
              <time dateTime={model.releaseDate}>
                {formatDate(model.releaseDate)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Weights</dt>
            <dd>{model.openWeights ? "Open weights" : "Proprietary"}</dd>
          </div>
          <div>
            <dt>Context window</dt>
            <dd>
              {model.contextWindow
                ? `${formatCount(model.contextWindow)} tokens`
                : "Not listed"}
            </dd>
          </div>
          <div>
            <dt>Input price / Mtok</dt>
            <dd>
              {model.pricing ? `$${formatPrice(model.pricing.input)}` : "Not listed"}
            </dd>
          </div>
          <div>
            <dt>Output price / Mtok</dt>
            <dd>
              {model.pricing
                ? `$${formatPrice(model.pricing.output)}`
                : "Not listed"}
            </dd>
          </div>
          <div>
            <dt>Price source</dt>
            <dd>
              {model.pricing ? (
                <span className="record-source">
                  <a
                    className="link-external"
                    href={model.pricing.source.url}
                    target="_blank"
                    rel="noreferrer"
                    data-source="pricing"
                  >
                    Official pricing <ExternalIcon className="ext" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <time dateTime={model.pricing.source.retrieved}>
                    Checked {formatDate(model.pricing.source.retrieved)}
                  </time>
                </span>
              ) : (
                "Not listed"
              )}
            </dd>
          </div>
          <div>
            <dt>Reasoning effort</dt>
            <dd>{row.reasoningEffort ?? "Not listed"}</dd>
          </div>
        </dl>
      </details>

      <section className="record-section" aria-labelledby="record-scores">
        <h2 id="record-scores">Scores and sources</h2>
        <p className="record-section-intro">
          Measured scores retain their source and retrieval date. Missing scores
          are not treated as zero.
        </p>
        <div className="record-score-region">
          <table className="record-score-table">
            <caption className="sr-only">
              Benchmark scores, evaluation settings, sources, and retrieval
              dates for {model.name}
            </caption>
            <thead>
              <tr>
                <th scope="col">Benchmark</th>
                <th scope="col">Category</th>
                <th scope="col">Score</th>
                <th scope="col">Evaluation settings</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map((benchmark) => {
                const score = row.scoresByBenchmark[benchmark.id];

                return (
                  <tr
                    key={benchmark.id}
                    id={`benchmark-${benchmark.id}`}
                    data-measured={score ? "true" : "false"}
                  >
                    <th scope="row">
                      <span>{benchmark.name}</span>
                      {score?.selfReported ? (
                        <Badge tone="warn">Vendor-reported</Badge>
                      ) : null}
                    </th>
                    <td>{rankScopeLabel(benchmark.category)}</td>
                    <td
                      className="num record-score-value"
                      aria-label={score ? undefined : "Not measured"}
                    >
                      {score ? formatScore(score.value) : "—"}
                    </td>
                    <td>
                      {score
                        ? score.settings ?? "Not specified"
                        : "Not measured in this dataset"}
                    </td>
                    <td>
                      {score ? (
                        <span className="record-source">
                          <a
                            className="link-external"
                            href={score.source.url}
                            target="_blank"
                            rel="noreferrer"
                            data-source={benchmark.id}
                          >
                            Open source <ExternalIcon className="ext" />
                            <span className="sr-only">
                              {" "}
                              (opens in a new tab)
                            </span>
                          </a>
                          <time dateTime={score.source.retrieved}>
                            Retrieved {formatDate(score.source.retrieved)}
                          </time>
                        </span>
                      ) : (
                        <span className="missing-value">No source</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
