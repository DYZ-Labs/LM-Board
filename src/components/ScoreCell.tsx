import type { CSSProperties, MouseEvent } from "react";

import { Badge } from "@/components/Badge";
import type { LeaderboardClientScore } from "@/lib/data";
import { formatDate, formatScore } from "@/lib/format";
import type { ScoreDomain } from "@/lib/ramp";
import { normalizeToRange } from "@/lib/visualization";

type ScoreCellProps = {
  score: LeaderboardClientScore | null;
  isBest: boolean;
  modelId: string;
  modelName: string;
  benchmarkId: string;
  benchmarkName: string;
  domain: ScoreDomain | undefined;
  active: boolean;
  featuredOnMobile: boolean;
  onInspect: (
    inspection: ScoreInspection,
    trigger: HTMLAnchorElement,
  ) => void;
};

export type ScoreInspection = {
  id: string;
  modelId: string;
  modelName: string;
  benchmarkId: string;
  benchmarkName: string;
  score: LeaderboardClientScore;
  isBest: boolean;
};

export function scoreHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export function ScoreCell({
  score,
  isBest,
  modelId,
  modelName,
  benchmarkId,
  benchmarkName,
  domain,
  active,
  featuredOnMobile,
  onInspect,
}: ScoreCellProps) {
  if (!score) {
    return (
      // The em dash is silent, so this label is the whole cell to anyone
      // listening — it has to rule out the reading a blank invites, that the
      // model scored zero. "Measured" is also the word the visible copy uses
      // for the same fact, in the ribbon and in the Index coverage line.
      <td
        className={`numeric-cell score-cell missing-value${featuredOnMobile ? " is-mobile-sort-score" : ""}`}
        aria-label="Not measured"
      >
        {featuredOnMobile ? (
          <span className="mobile-score-label">{benchmarkName}</span>
        ) : null}
        —
      </td>
    );
  }

  const measuredScore = score;
  const inspectionId = `${modelId}-${benchmarkId}`;
  const formatted = formatScore(measuredScore.value);
  const fill = domain
    ? normalizeToRange(measuredScore.value, domain.min, domain.max)
    : 0;
  const style = {
    "--inline-score-fill": `${Math.round(fill * 100)}%`,
  } as CSSProperties;

  function inspect(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onInspect(
      {
        id: inspectionId,
        modelId,
        modelName,
        benchmarkId,
        benchmarkName,
        score: measuredScore,
        isBest,
      },
      event.currentTarget,
    );
  }

  const sourceLink = (
    <a
      className="score-source"
      href={measuredScore.source.url}
      target="_blank"
      rel="noreferrer"
      aria-haspopup="dialog"
      aria-expanded={active}
      aria-controls={active ? "score-inspector" : undefined}
      onClick={inspect}
      // The row header supplies the model name in table context. Repeating
      // it in 456 link names makes navigation noisier as well as bloating
      // the static payload; the benchmark, host and retrieval date are the
      // evidence-specific parts the visible number alone cannot carry.
      aria-label={`${formatted} — ${benchmarkName} source, ${scoreHost(measuredScore.source.url)}, retrieved ${formatDate(measuredScore.source.retrieved)}${isBest ? ". Best score in this column." : ""}`}
    >
      {formatted}
    </a>
  );

  return (
    <td
      className={`numeric-cell score-cell${isBest ? " is-best" : ""}${featuredOnMobile ? " is-mobile-sort-score" : ""}`}
      style={style}
    >
      {featuredOnMobile ? (
        <span className="mobile-score-label">{benchmarkName}</span>
      ) : null}
      {/* The numeral *is* the citation. It used to be a chip revealed on
          hover, which meant the product's central claim — every number links
          to its source — was false on any device without a pointer, and the
          chip was unreachable by tap. A link on the number needs no hover, is
          in the tab order for free, and gets the whole cell as its target on
          coarse pointers (see utilities.css). The wrapper only exists for the
          exceptional vendor badge; 456 ordinary cells stay one link deep. */}
      {measuredScore.selfReported ? (
        <span className="score-value-line">
          {sourceLink}
          <Badge tone="warn" title="Reported by the model's maker">
            <span aria-hidden="true">Vendor</span>
            <span className="sr-only">Self-reported score</span>
          </Badge>
        </span>
      ) : (
        sourceLink
      )}
    </td>
  );
}
