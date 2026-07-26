"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { LeaderboardRow } from "@/lib/data";
import { formatPrice, formatScore } from "@/lib/format";
import type { RankScope } from "@/lib/index";

const WIDTH = 920;
const HEIGHT = 520;
const PAD = { top: 24, right: 28, bottom: 56, left: 62 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const LABEL_COUNT = 6;

type ScatterPlotProps = {
  rows: LeaderboardRow[];
  category: RankScope;
};

/**
 * Price against Index — the second projection, and the most screenshot-able
 * artefact the dataset can produce.
 *
 * Price uses a log scale: input prices span roughly $0.05 to $15 per Mtok, and
 * a linear axis would crush three quarters of the field against the left edge.
 * Points are never the only encoding — the sr-only table below carries every
 * value, and open-weight models are distinguished by fill *and* listed.
 */
export function ScatterPlot({ rows, category }: ScatterPlotProps) {
  const scopeLabel =
    category === "overall"
      ? "Overall"
      : `${category.charAt(0).toUpperCase()}${category.slice(1)}`;

  const { points, xOf } = useMemo(() => {
    const usable = rows.filter(
      (row) => row.model.pricing != null && row.scopes[category].index != null,
    );
    if (usable.length === 0) {
      return { points: [], xOf: () => PAD.left };
    }

    const prices = usable.map((row) => Math.max(0.01, row.model.pricing!.input));
    const indexes = usable.map((row) => row.scopes[category].index!);
    // A free tier would break log10; clamp to a floor rather than dropping the
    // model from the plot entirely.
    const logMin = Math.log10(Math.min(...prices));
    const logMax = Math.log10(Math.max(Math.max(...prices), Math.min(...prices) * 1.5));
    const logSpan = logMax - logMin || 1;
    const minIndex = Math.min(...indexes);
    const indexSpan = Math.max(1, Math.max(...indexes) - minIndex);

    const scaleX = (price: number) =>
      PAD.left + ((Math.log10(Math.max(0.01, price)) - logMin) / logSpan) * PLOT_W;

    return {
      xOf: scaleX,
      points: usable.map((row) => {
        const price = Math.max(0.01, row.model.pricing!.input);
        const index = row.scopes[category].index!;

        return {
          row,
          price,
          index,
          x: scaleX(price),
          y: PAD.top + PLOT_H - ((index - minIndex) / indexSpan) * PLOT_H,
        };
      }),
    };
  }, [category, rows]);

  const excluded = rows.length - points.length;

  // Label only the frontier: the highest Index seen at or below each price.
  // Labelling all 62 points would need collision avoidance and would bury the
  // shape of the data under text.
  const labelled = useMemo(() => {
    const byPrice = [...points].sort((a, b) => a.price - b.price);
    const frontier: typeof points = [];
    let best = -Infinity;

    for (const point of byPrice) {
      if (point.index > best) {
        best = point.index;
        frontier.push(point);
      }
    }

    return new Set(frontier.slice(-LABEL_COUNT).map((point) => point.row.model.id));
  }, [points]);

  const priceTicks = [0.1, 0.5, 1, 2, 5, 10, 20];

  if (points.length === 0) {
    return (
      <div className="compare-empty">
        <p>
          No model in this view has both a listed price and a{" "}
          {scopeLabel} Index, so there is nothing to plot.
        </p>
      </div>
    );
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  return (
    <div className="plot-frame">
      <svg
        className="plot-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Scatter plot of input price against ${scopeLabel} Index for ${points.length} models. The full data is in the table below.`}
      >
        <g className="plot-grid">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = PAD.top + PLOT_H * fraction;
            return (
              <line key={fraction} x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} />
            );
          })}
        </g>

        <g className="plot-axis">
          <line
            x1={PAD.left}
            x2={PAD.left}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
          />
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
          />
          {priceTicks.map((tick) => {
            const x = xOf(tick);
            if (x < PAD.left - 1 || x > WIDTH - PAD.right + 1) return null;

            return (
              <text
                key={tick}
                className="plot-tick"
                x={x}
                y={PAD.top + PLOT_H + 18}
                textAnchor="middle"
              >
                ${tick}
              </text>
            );
          })}
          <text
            className="plot-axis-label"
            x={PAD.left + PLOT_W / 2}
            y={HEIGHT - 12}
            textAnchor="middle"
          >
            Input price · USD per Mtok · log scale
          </text>
          <text
            className="plot-axis-label"
            transform={`rotate(-90 22 ${PAD.top + PLOT_H / 2})`}
            x={22}
            y={PAD.top + PLOT_H / 2}
            textAnchor="middle"
          >
            {scopeLabel} Index
          </text>
        </g>

        <g>
          {points.map((point) => (
            <circle
              key={point.row.model.id}
              className={`plot-point${point.row.model.openWeights ? " is-open" : ""}`}
              cx={point.x}
              cy={point.y}
              r={5.5}
            >
              <title>
                {point.row.model.name} — {scopeLabel} Index{" "}
                {formatScore(point.index)}, ${formatPrice(point.price)} per Mtok
                input
                {point.row.model.openWeights ? ", open weights" : ""}
              </title>
            </circle>
          ))}
        </g>

        <g>
          {points
            .filter((point) => labelled.has(point.row.model.id))
            .map((point) => {
              // Flip the label inside the frame near the edges.
              const nearRight = point.x > PAD.left + PLOT_W * 0.82;
              const nearTop = point.y < PAD.top + 18;

              return (
                <text
                  key={`label-${point.row.model.id}`}
                  className="plot-label"
                  x={point.x + (nearRight ? -9 : 9)}
                  y={point.y + (nearTop ? 16 : -9)}
                  textAnchor={nearRight ? "end" : "start"}
                >
                  {point.row.model.name}
                </text>
              );
            })}
        </g>
      </svg>

      <p className="plot-legend">
        <span>
          <i aria-hidden="true" /> Closed weights
        </span>
        <span>
          <i className="open" aria-hidden="true" /> Open weights
        </span>
        <span className="text-tertiary">
          Labelled: the best Index available at or below each price.
        </span>
        {excluded > 0 ? (
          <span className="text-tertiary">
            {excluded} model{excluded === 1 ? "" : "s"} not plotted — no listed
            price or no {scopeLabel} Index.
          </span>
        ) : null}
      </p>

      {/* The plot is decorative without this. Every plotted value, in order. */}
      <table className="sr-only">
        <caption>
          {scopeLabel} Index against input price for every plotted model
        </caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">{scopeLabel} Index</th>
            <th scope="col">Input price per Mtok</th>
            <th scope="col">Weights</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.row.model.id}>
              <th scope="row">
                <Link href={`/model/${point.row.model.id}`}>
                  {point.row.model.name}
                </Link>
              </th>
              <td>{formatScore(point.index)}</td>
              <td>${formatPrice(point.price)}</td>
              <td>{point.row.model.openWeights ? "Open" : "Closed"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <span className="sr-only">
        Plot bounds: x from {Math.round(xMin)} to {Math.round(xMax)}, y from{" "}
        {Math.round(yMin)} to {Math.round(yMax)}.
      </span>
    </div>
  );
}
