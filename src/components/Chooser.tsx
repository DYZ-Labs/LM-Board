"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/Badge";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ExternalIcon } from "@/components/Icon";
import {
  DEFAULT_CHOOSER_STATE,
  buildChooserShortlist,
  canonicalizeChooserUrl,
  chooserStateFromSearchParams,
  chooserStateToUrl,
  expandChooserPayload,
  type ChooserAccess,
  type ChooserPayload,
  type ChooserState,
  type ChooserTask,
  type ContextFloor,
} from "@/lib/chooser";
import { rankScopeLabel } from "@/lib/categories";
import {
  formatCount,
  formatDate,
  formatPrice,
  formatScore,
} from "@/lib/format";
import { trackEvent } from "@/lib/track";

type ChooserProps = {
  payload: ChooserPayload;
};

type DraftState = {
  task: ChooserTask;
  access: ChooserAccess;
  minContext: ContextFloor;
  input: string;
  output: string;
};

const TASK_OPTIONS: Array<{ value: ChooserTask; label: string }> = [
  { value: "overall", label: "Overall" },
  { value: "reasoning", label: "Reasoning" },
  { value: "coding", label: "Coding" },
  { value: "math", label: "Math" },
  { value: "agentic", label: "Agentic" },
];

const ACCESS_OPTIONS: Array<{
  value: ChooserAccess;
  label: string;
  detail: string;
}> = [
  { value: "any", label: "Any", detail: "API or open weights" },
  { value: "api", label: "Hosted API", detail: "First-party price listed" },
  { value: "open", label: "Open weights", detail: "Weights available" },
];

const CONTEXT_OPTIONS: Array<{ value: ContextFloor; label: string }> = [
  { value: 0, label: "No minimum" },
  { value: 128000, label: "128K tokens" },
  { value: 200000, label: "200K tokens" },
  { value: 400000, label: "400K tokens" },
  { value: 1000000, label: "1M tokens" },
];

function draftFromState(state: ChooserState): DraftState {
  return {
    task: state.task,
    access: state.access,
    minContext: state.minContext,
    input: state.maxInputPrice === null ? "" : String(state.maxInputPrice),
    output: state.maxOutputPrice === null ? "" : String(state.maxOutputPrice),
  };
}

function priceError(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Enter a finite price.";
  if (parsed < 0) return "Price cannot be negative.";
  return null;
}

function stateFromDraft(draft: DraftState): ChooserState | null {
  if (priceError(draft.input) || priceError(draft.output)) return null;
  return {
    task: draft.task,
    access: draft.access,
    minContext: draft.minContext,
    maxInputPrice: draft.input.trim() === "" ? null : Number(draft.input),
    maxOutputPrice: draft.output.trim() === "" ? null : Number(draft.output),
  };
}

function accessLabel(openWeights: boolean, hasPricing: boolean) {
  if (openWeights && hasPricing) return "Open weights + hosted API";
  if (openWeights) return "Open weights; no first-party API price listed";
  return "Hosted API";
}

function capCount(state: ChooserState) {
  return Number(state.maxInputPrice !== null) + Number(state.maxOutputPrice !== null);
}

export function Chooser({ payload }: ChooserProps) {
  const models = useMemo(() => expandChooserPayload(payload), [payload]);
  const [applied, setApplied] = useState<ChooserState>(DEFAULT_CHOOSER_STATE);
  const [draft, setDraft] = useState<DraftState>(() =>
    draftFromState(DEFAULT_CHOOSER_STATE),
  );
  const [ready, setReady] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterApplyRef = useRef(false);
  const shortlist = useMemo(
    () => buildChooserShortlist(models, applied),
    [applied, models],
  );
  const inputError = priceError(draft.input);
  const outputError = priceError(draft.output);

  useEffect(() => {
    function read(canonicalize = false) {
      const current = new URL(window.location.href);
      const next = chooserStateFromSearchParams(current.searchParams);
      setApplied(next);
      setDraft(draftFromState(next));
      setSubmitAttempted(false);
      setReady(true);

      if (canonicalize) {
        const canonical = canonicalizeChooserUrl(current);
        if (canonical.href !== current.href) {
          window.history.replaceState(window.history.state, "", canonical);
        }
      }
    }

    read(true);
    const restore = () => read(false);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useLayoutEffect(() => {
    if (ready) delete document.documentElement.dataset.choosePending;
  }, [ready]);

  useLayoutEffect(() => {
    if (!focusAfterApplyRef.current) return;
    resultHeadingRef.current?.focus();
    focusAfterApplyRef.current = false;
  }, [applied]);

  function publish(next: ChooserState, action: "apply" | "relax" | "reset") {
    const result = buildChooserShortlist(models, next);
    setApplied(next);
    setDraft(draftFromState(next));
    setSubmitAttempted(false);
    focusAfterApplyRef.current = true;
    const url = chooserStateToUrl(new URL(window.location.href), next);
    window.history.pushState(
      { ...(window.history.state ?? {}), lmboardChooser: true },
      "",
      url,
    );
    trackEvent("chooser_apply", {
      action,
      task: next.task,
      access: next.access,
      context: next.minContext,
      price_caps: capCount(next),
      results: result.cards.length,
      candidates: result.counts.afterCoverage,
      no_results: result.cards.length === 0,
    });
  }

  function applyDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    const next = stateFromDraft(draft);
    if (!next) return;
    publish(next, "apply");
  }

  const compareHref = `/compare?models=${shortlist.cards
    .map((card) => card.model.id)
    .join(",")}`;
  const taskLabel = rankScopeLabel(applied.task);

  return (
    <section className="longform chooser-page" id="choose" aria-label="Choose a model">
      <div className="longform-intro chooser-intro">
        <p className="section-kicker">Guided model chooser</p>
        <h1>Find a model for the work</h1>
        <p>
          Apply practical constraints, then inspect a deterministic shortlist
          built from the same Index and coverage rules as the leaderboard.
        </p>
      </div>

      <form
        className="chooser-form"
        action="/choose"
        method="get"
        noValidate
        onSubmit={applyDraft}
      >
        <fieldset className="chooser-fieldset chooser-task-fieldset">
          <legend>Task</legend>
          <div className="chooser-radio-grid chooser-task-grid">
            {TASK_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="task"
                  value={option.value}
                  checked={draft.task === option.value}
                  onChange={() =>
                    setDraft((current) => ({ ...current, task: option.value }))
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="chooser-fieldset">
          <legend>Access</legend>
          <div className="chooser-radio-grid chooser-access-grid">
            {ACCESS_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="access"
                  value={option.value}
                  checked={draft.access === option.value}
                  onChange={() =>
                    setDraft((current) => ({ ...current, access: option.value }))
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="chooser-fieldset chooser-limits">
          <legend>Limits</legend>
          <div className="chooser-limit-grid">
            <label className="chooser-control">
              <span>Minimum context</span>
              <select
                name="context"
                value={draft.minContext}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    minContext: Number(event.target.value) as ContextFloor,
                  }))
                }
              >
                {CONTEXT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>Models with unknown context are excluded when set.</small>
            </label>

            <label className="chooser-control">
              <span>Maximum input price</span>
              <span className="chooser-price-input">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  name="input"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={draft.input}
                  aria-invalid={submitAttempted && inputError ? true : undefined}
                  aria-describedby="chooser-input-help chooser-input-error"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      input: event.target.value,
                    }))
                  }
                />
                <span>/ 1M</span>
              </span>
              <small id="chooser-input-help">Leave blank for no cap.</small>
              <span className="chooser-error" id="chooser-input-error" role="alert">
                {submitAttempted ? inputError : null}
              </span>
            </label>

            <label className="chooser-control">
              <span>Maximum output price</span>
              <span className="chooser-price-input">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  name="output"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={draft.output}
                  aria-invalid={submitAttempted && outputError ? true : undefined}
                  aria-describedby="chooser-output-help chooser-output-error"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      output: event.target.value,
                    }))
                  }
                />
                <span>/ 1M</span>
              </span>
              <small id="chooser-output-help">Leave blank for no cap.</small>
              <span className="chooser-error" id="chooser-output-error" role="alert">
                {submitAttempted ? outputError : null}
              </span>
            </label>
          </div>
        </fieldset>

        <div className="chooser-form-actions">
          <button className="btn btn-primary" type="submit">
            Update shortlist
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => publish(DEFAULT_CHOOSER_STATE, "reset")}
          >
            Reset constraints
          </button>
          <p>Prices are USD per million uncached input or output tokens.</p>
        </div>
      </form>

      <div className="chooser-results-region">
        <div className="chooser-results-head">
          <div>
            <p className="section-kicker">Applied shortlist</p>
            <h2 ref={resultHeadingRef} tabIndex={-1}>
              {taskLabel} recommendations
            </h2>
          </div>
          <p className="chooser-result-count" role="status" aria-live="polite" aria-atomic="true">
            {ready
              ? `${shortlist.cards.length} ${shortlist.cards.length === 1 ? "model" : "models"} shown from ${shortlist.counts.afterCoverage} ranked candidates.`
              : ""}
          </p>
        </div>

        <div className="chooser-results-live">
          {shortlist.cards.length > 0 ? (
            <div className="chooser-cards">
              {shortlist.cards.map((card) => {
                const pricing = card.model.pricing;
                return (
                  <article className="chooser-card" key={card.model.id}>
                    <div className="chooser-card-labels" aria-label="Recommendation labels">
                      {card.labels.map((label) => (
                        <Badge
                          key={label}
                          tone={label === "Open-weights leader" ? "pos" : "neutral"}
                        >
                          {label}
                        </Badge>
                      ))}
                    </div>
                    <header>
                      <div>
                        <h3>{card.model.name}</h3>
                        <p>{card.model.lab}</p>
                      </div>
                      <div className="chooser-index">
                        <strong className="num">{formatScore(card.scope.index)}</strong>
                        <span>{taskLabel} Index</span>
                      </div>
                    </header>

                    <dl className="chooser-card-facts">
                      <div>
                        <dt>Standing</dt>
                        <dd>
                          Rank {card.scope.rank} of {card.scope.rankedFieldSize}
                        </dd>
                      </div>
                      <div>
                        <dt>Leader gap</dt>
                        <dd>
                          {card.gapFromLeader === 0
                            ? "Leads shortlist"
                            : `${formatScore(card.gapFromLeader)} Index points`}
                        </dd>
                      </div>
                      <div>
                        <dt>Coverage</dt>
                        <dd>
                          {card.scope.coverageCount} of {card.scope.coverageTotal} measured ·{" "}
                          {card.scope.estimatedCount} estimated
                        </dd>
                      </div>
                      <div>
                        <dt>Access</dt>
                        <dd>{accessLabel(card.model.openWeights, pricing !== null)}</dd>
                      </div>
                      <div>
                        <dt>Context</dt>
                        <dd>
                          {card.model.contextWindow === null
                            ? "Not listed"
                            : `${formatCount(card.model.contextWindow)} tokens`}
                        </dd>
                      </div>
                      <div>
                        <dt>Input / output</dt>
                        <dd>
                          {pricing
                            ? `$${formatPrice(pricing.input)} / $${formatPrice(pricing.output)} per 1M`
                            : "No first-party API price listed"}
                        </dd>
                      </div>
                    </dl>

                    {pricing ? (
                      <p className="chooser-price-source">
                        <a
                          className="link-external"
                          href={pricing.source.url}
                          target="_blank"
                          rel="noreferrer"
                          data-source="pricing"
                          data-source-kind="price"
                        >
                          Official pricing <ExternalIcon className="ext" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                        <time dateTime={pricing.source.retrieved}>
                          Checked {formatDate(pricing.source.retrieved)}
                        </time>
                      </p>
                    ) : (
                      <p className="chooser-price-source">Price source not listed</p>
                    )}

                    <Link
                      className="btn chooser-record-link"
                      href={`/model/${card.model.id}`}
                      prefetch={false}
                      onClick={() =>
                        trackEvent("shortlist_record_open", {
                          model: card.model.id,
                          task: applied.task,
                        })
                      }
                    >
                      Open model record
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="chooser-empty">
              <h3>No ranked models meet every applied constraint</h3>
              <p>
                Constraints are never weakened automatically. The counts below
                show where candidates left the funnel.
              </p>
              <ol aria-label="Candidate counts after each filter">
                <li><span>Starting catalog</span><strong>{shortlist.counts.total}</strong></li>
                <li><span>After access</span><strong>{shortlist.counts.afterAccess}</strong></li>
                <li><span>After context</span><strong>{shortlist.counts.afterContext}</strong></li>
                <li><span>After price</span><strong>{shortlist.counts.afterPrice}</strong></li>
                <li><span>After {taskLabel} coverage</span><strong>{shortlist.counts.afterCoverage}</strong></li>
              </ol>
              {shortlist.counts.unrankedExcluded > 0 ? (
                <p>
                  {shortlist.counts.unrankedExcluded} otherwise eligible {shortlist.counts.unrankedExcluded === 1 ? "model was" : "models were"} excluded because the selected task has no valid Index.
                </p>
              ) : null}
              <div className="chooser-relax-actions">
                {applied.maxInputPrice !== null || applied.maxOutputPrice !== null ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      publish(
                        { ...applied, maxInputPrice: null, maxOutputPrice: null },
                        "relax",
                      )
                    }
                  >
                    Remove price caps
                  </button>
                ) : null}
                {applied.minContext !== 0 ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => publish({ ...applied, minContext: 0 }, "relax")}
                  >
                    Remove context minimum
                  </button>
                ) : null}
                {applied.access !== "any" ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => publish({ ...applied, access: "any" }, "relax")}
                  >
                    Allow API or open weights
                  </button>
                ) : null}
                <button
                  className="btn"
                  type="button"
                  onClick={() => publish(DEFAULT_CHOOSER_STATE, "reset")}
                >
                  Reset all constraints
                </button>
              </div>
            </div>
          )}
        </div>

        {!ready ? (
          <div className="chooser-initial-skeleton" aria-busy="true" aria-label="Loading shared shortlist">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="chooser-card is-skeleton" key={index} aria-hidden="true">
                <span className="skeleton-bar" />
                <span className="skeleton-bar" />
                <span className="skeleton-bar" />
                <span className="skeleton-bar" />
              </div>
            ))}
          </div>
        ) : null}

        <div className="chooser-shortlist-actions">
          {shortlist.cards.length >= 2 ? (
            <Link
              className="btn btn-primary"
              href={compareHref}
              prefetch={false}
              onClick={() =>
                trackEvent("shortlist_compare", {
                  models: shortlist.cards.length,
                  task: applied.task,
                })
              }
            >
              Compare shortlist
            </Link>
          ) : (
            <button className="btn btn-primary" type="button" disabled>
              Compare shortlist
            </button>
          )}
          <CopyLinkButton
            surface="chooser"
            label="Copy shortlist"
            confirmation="Shortlist link copied"
          />
          {shortlist.cards.length < 2 ? (
            <p>At least two qualifying models are needed for comparison.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
