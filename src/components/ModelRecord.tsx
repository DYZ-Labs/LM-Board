import Link from "next/link";

import { Badge } from "@/components/Badge";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ExternalIcon } from "@/components/Icon";
import type { LeaderboardRow } from "@/lib/data";
import {
  formatCount,
  formatDate,
  formatPrice,
  formatScore,
} from "@/lib/format";
import { RANK_SCOPES, type RankScope } from "@/lib/index";
import type { Benchmark } from "@/lib/schema";

const SCOPE_LABELS: Record<RankScope, string> = {
  overall: "Overall",
  reasoning: "Reasoning",
  coding: "Coding",
  math: "Math",
  agentic: "Agentic",
};

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
        <div className="row">
          <CopyLinkButton
            label="Copy link"
            confirmation={`Link to ${model.name} copied`}
          />
          <Link className="btn" href={`/compare?models=${model.id}`}>
            Compare
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
          <Link className="btn" href="/#leaderboard">
            Back to the board
          </Link>
        </div>
      </header>

      <section className="record-section" aria-labelledby="record-standing">
        <h2 id="record-standing">Standing</h2>
        <dl className="record-scopes">
          {RANK_SCOPES.map((scope) => {
            const entry = row.scopes[scope];

            return (
              <div className="record-scope" key={scope}>
                <dt>{SCOPE_LABELS[scope]}</dt>
                {/* A <dl> group may only contain <dt> and <dd>; the coverage
                    note is a second <dd> rather than a <p>. */}
                <dd>
                  {entry.index === null ? (
                    <span className="rank-note">Insufficient data</span>
                  ) : (
                    <>
                      {formatScore(entry.index)}
                      <span className="rank-note">
                        {entry.rank === null ? "unranked" : `rank ${entry.rank}`}
                      </span>
                    </>
                  )}
                </dd>
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

      <section className="record-section" aria-labelledby="record-facts">
        <h2 id="record-facts">Specification</h2>
        <dl className="model-metadata">
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
            <dd>{model.openWeights ? "Open weights" : "Closed weights"}</dd>
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
            <dt>Reasoning effort</dt>
            <dd>{row.reasoningEffort ?? "Not listed"}</dd>
          </div>
        </dl>
      </section>

      <section className="record-section" aria-labelledby="record-scores">
        <h2 id="record-scores">Scores and provenance</h2>
        <div className="detail-score-grid">
          {benchmarks.map((benchmark) => {
            const score = row.scoresByBenchmark[benchmark.id];

            return (
              <article className="detail-score" key={benchmark.id}>
                <div className="detail-score-heading">
                  <h3>{benchmark.name}</h3>
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
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      <span>
                        Retrieved{" "}
                        <time dateTime={score.source.retrieved}>
                          {formatDate(score.source.retrieved)}
                        </time>
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="missing-value">
                    No curated score is currently available. A missing result is
                    never recorded as a zero.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </article>
  );
}
