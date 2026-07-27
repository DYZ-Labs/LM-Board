import Link from "next/link";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ExternalIcon } from "@/components/Icon";
import type { LeaderboardClientRow } from "@/lib/data";
import { formatDate, formatPrice } from "@/lib/format";
import type { Benchmark } from "@/lib/schema";

type DetailPanelProps = {
  row: LeaderboardClientRow;
  benchmarks: Benchmark[];
  colSpan: number;
  state: "opening" | "open" | "closing";
  onExitComplete: () => void;
};

/**
 * A preview of /model/[id]. The full, linkable record lives on its own route;
 * this panel exists so a comparison can be made without leaving the board.
 */
export function DetailPanel({
  row,
  benchmarks,
  colSpan,
  state,
  onExitComplete,
}: DetailPanelProps) {
  const { model } = row;
  const overall = row.scopes.overall;
  const measuredScores = benchmarks.filter(
    (benchmark) => row.scoresByBenchmark[benchmark.id] !== null,
  ).length;

  return (
    <tr
      className="detail-row"
      id={`details-${model.id}`}
      aria-hidden={state === "closing" || undefined}
    >
      <td colSpan={colSpan}>
        <div
          className="detail-collapse"
          data-state={state}
          inert={state === "closing" || undefined}
          onTransitionEnd={(event) => {
            if (
              state === "closing" &&
              event.target === event.currentTarget &&
              event.propertyName === "grid-template-rows"
            ) {
              onExitComplete();
            }
          }}
          onTransitionCancel={() => {
            if (state === "closing") onExitComplete();
          }}
        >
          <div className="detail-collapse-inner">
            <section
              className="detail-panel"
              aria-label={`${model.name} details`}
            >
              <div className="detail-heading">
                <div>
                  <p className="detail-eyebrow">Model record</p>
                  <h2>{model.name}</h2>
                </div>
                <div className="detail-actions">
                  <CopyLinkButton
                    surface="row"
                    href={`/model/${model.id}`}
                    label="Copy link"
                    confirmation={`Link to ${model.name} copied`}
                  />
                  <Link className="btn" href={`/model/${model.id}`}>
                    Open model page
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
                </div>
              </div>

              <dl className="model-metadata">
                <div>
                  <dt>Provider</dt>
                  <dd>{model.lab}</dd>
                </div>
                <div>
                  <dt>Released</dt>
                  <dd>{formatDate(model.releaseDate)}</dd>
                </div>
                <div>
                  <dt>Weights</dt>
                  <dd>
                    {model.openWeights ? "Open weights" : "Closed weights"}
                  </dd>
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
                  <dt>Evidence</dt>
                  <dd>
                    {measuredScores} of {benchmarks.length} measured
                    {overall.estimatedCount > 0
                      ? `; ${overall.estimatedCount} estimated`
                      : null}
                  </dd>
                </div>
              </dl>

              <p className="detail-evidence-note">
                Every measured score keeps its source and retrieval date. Open
                the model page for the complete benchmark evidence table and
                evaluation settings.
              </p>
            </section>
          </div>
        </div>
      </td>
    </tr>
  );
}
