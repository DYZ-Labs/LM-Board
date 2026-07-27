"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { formatPrice, formatScore } from "@/lib/format";
import type { RankScope } from "@/lib/index";
import {
  efficientFrontier,
  expandPlotPayload,
  type PlotPayload,
  type PlotRow,
  type ScopedPlotRow,
} from "@/lib/visualization";

import "@/styles/plot.css";

/* The plot area is measured in percentages of its own box, never in SVG user
   units: type, marks and hit targets then stay the size they were designed at
   from 320px to 1920px, and the stage is free to go portrait on a phone. */
const X_INSET = 3;
const Y_INSET = 4;
const FREE_LANE_END = 9;
const POSITIVE_X_START = 14;

/* Label placement is solved once, at build time, against the narrowest
   geometry that still direct-labels (a 900px viewport). Every wider stage has
   strictly more room, so a layout that clears here clears everywhere. */
const REF_W = 780;
const REF_H = 440;
const LABEL_H = 14;
const LABEL_LIFT = 9;
const LABEL_PAD = 3;
const POINT_R = 7;
const LEADER_MIN = 4;

const NARROW = new Set(" .,:;'’|!iIjlt1[]()");
const WIDE = new Set("MWmw@%");

type ScatterPlotProps = {
  category: RankScope;
  syncPointToUrl?: boolean;
} & (
  | { rows: readonly PlotRow[]; payload?: never }
  | { payload: PlotPayload; rows?: never }
);

type Point = {
  row: ScopedPlotRow;
  price: number;
  index: number;
  x: number;
  y: number;
  frontier: boolean;
  free: boolean;
};

type Box = { left: number; right: number; top: number; bottom: number };

/** Advance-width estimate for 11px Archivo, ±3px over a model name. */
function textWidth(text: string) {
  let width = 0;

  for (const character of text) {
    width += NARROW.has(character) ? 3.3 : WIDE.has(character) ? 9 : 6.1;
  }

  return width;
}

function overlaps(a: Box, b: Box) {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

function priceTickLabel(value: number) {
  return value < 1 ? `$${value.toFixed(2)}` : `$${value}`;
}

/**
 * Price against Index — the second projection, and the most screenshot-able
 * artefact the dataset can produce.
 *
 * Price uses a log scale: input prices span roughly $0.14 to $15 per Mtok, and
 * a linear axis would crush three quarters of the field against the left edge.
 * Open weights are encoded by *shape* — a ring rather than a disc — because
 * hue alone is a class that tritanopes cannot see: the blue/green pair this
 * plot used to draw measures ΔE 3.8 under tritan simulation, i.e. one class.
 * Nothing is encoded by colour alone, and the sr-only table below carries
 * every plotted value.
 */
export function ScatterPlot(props: ScatterPlotProps) {
  const { category, syncPointToUrl = false } = props;
  const payload = "payload" in props ? props.payload : undefined;
  const rows = "rows" in props ? props.rows : undefined;
  const scopedRows = useMemo(
    () =>
      payload === undefined
        ? rows!.map((row) => ({
            model: row.model,
            scope: row.scopes[category],
          }))
        : expandPlotPayload(payload),
    [category, payload, rows],
  );
  const scopeLabel =
    category === "overall"
      ? "Overall"
      : `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const recordLinkRef = useRef<HTMLAnchorElement | null>(null);

  const plot = useMemo(() => {
    const usable = scopedRows.filter(
      (row) => row.model.pricing != null && row.scope.index != null,
    );

    if (usable.length === 0) return null;

    const prices = usable.map((row) => row.model.pricing!.input);
    const positivePrices = prices.filter((price) => price > 0);
    const indexes = usable.map((row) => row.scope.index!);
    const hasFree = prices.some((price) => price === 0);
    const positiveMin =
      positivePrices.length > 0 ? Math.min(...positivePrices) : 1;
    const positiveMax =
      positivePrices.length > 0 ? Math.max(...positivePrices) : 10;
    const logMin = Math.log10(positiveMin);
    const logMax = Math.log10(Math.max(positiveMax, positiveMin * 1.5));
    const logSpan = logMax - logMin || 1;
    // Snapped to fives so the reader can see that the axis is truncated and
    // read a distance off it; the raw min→max the plot used before put the top
    // point on the top gridline and bisected the bottom one with the axis.
    const yMin = Math.floor(Math.min(...indexes) / 5) * 5;
    const yMax = Math.max(yMin + 5, Math.ceil(Math.max(...indexes) / 5) * 5);

    const positiveStart = hasFree ? POSITIVE_X_START : X_INSET;
    const xOf = (price: number) =>
      price === 0
        ? FREE_LANE_END / 2
        : positiveStart +
          ((Math.log10(price) - logMin) / logSpan) *
            (100 - X_INSET - positiveStart);
    const yOf = (index: number) =>
      Y_INSET + (1 - (index - yMin) / (yMax - yMin)) * (100 - 2 * Y_INSET);

    const frontierIds = efficientFrontier(
      usable.map((row) => ({
        id: row.model.id,
        item: row,
        price: row.model.pricing!.input,
        index: row.scope.index!,
      })),
    );

    const points: Point[] = usable
      .map((row) => {
        const price = row.model.pricing!.input;
        const index = row.scope.index!;

        return {
          row,
          price,
          index,
          x: xOf(price),
          y: yOf(index),
          frontier: frontierIds.has(row.model.id),
          free: price === 0,
        };
      })
      // Paint order: the default sort is Index descending, so without this the
      // rank-1 point is drawn first and every lower-ranked model covers it.
      .sort((a, b) => a.index - b.index);

    const yTicks: { value: number; y: number; major: boolean }[] = [];

    for (let value = yMin; value <= yMax; value += 5) {
      yTicks.push({ value, y: yOf(value), major: value % 10 === 0 });
    }

    // A log axis is only legible if it carries its own signature: majors at the
    // decades, intermediates at 2 and 5, unlabelled stubs at the rest.
    const xTicks: { value: number; x: number; label: string | null }[] = hasFree
      ? [{ value: 0, x: xOf(0), label: "Free" }]
      : [];

    if (positivePrices.length > 0) {
      for (
        let decade = Math.floor(logMin);
        decade <= Math.ceil(logMax);
        decade += 1
      ) {
        for (let step = 1; step <= 9; step += 1) {
          const value = Number((step * 10 ** decade).toPrecision(3));
          const log = Math.log10(value);

          if (log < logMin - 1e-9 || log > logMax + 1e-9) continue;

          xTicks.push({
            value,
            x: xOf(value),
            label:
              step === 1 || step === 2 || step === 5
                ? priceTickLabel(value)
                : null,
          });
        }
      }
    }

    const frontier = [...points]
      .filter((point) => point.frontier)
      .sort((a, b) => a.price - b.price || a.index - b.index);

    const linePoints = frontier.filter(
      (point, position, list) =>
        position ===
        list.findIndex(
          (candidate) =>
            candidate.price === point.price && candidate.index === point.index,
        ),
    );
    const steps = linePoints
      .map((point, position) =>
        position === 0
          ? `M${point.x.toFixed(2)} ${point.y.toFixed(2)}`
          : `H${point.x.toFixed(2)}V${point.y.toFixed(2)}`,
      )
      .join("")
      .concat(linePoints.length > 0 ? `H${(100 - X_INSET).toFixed(2)}` : "");

    /* Declutter up and to the left. Left of a frontier point and above it is
       provably empty — anything there would have beaten it at a lower price
       and be on the frontier itself — whereas the tread to its right is only
       clear as far as the next riser, which is why labels drawn rightwards
       used to land on marks. Ties are then broken upward, into the same
       guaranteed-empty region. */
    const pointBoxes: Box[] = points.map((point) => ({
      left: (point.x / 100) * REF_W - POINT_R,
      right: (point.x / 100) * REF_W + POINT_R,
      top: (point.y / 100) * REF_H - POINT_R,
      bottom: (point.y / 100) * REF_H + POINT_R,
    }));
    const placed: Box[] = [];
    const labels = [...frontier]
      .sort(
        (a, b) =>
          b.index - a.index ||
          a.price - b.price ||
          a.row.model.name.localeCompare(b.row.model.name),
      )
      .map((point) => {
        const name = point.row.model.name;
        const value = formatScore(point.index);
        const width = textWidth(name) + textWidth(value) + 6;
        const pointX = (point.x / 100) * REF_W;
        const pointY = (point.y / 100) * REF_H;
        const flip = pointX - LABEL_LIFT - width >= 0;
        const left = flip ? pointX - LABEL_LIFT - width : pointX + LABEL_LIFT;
        let bottom = pointY - LABEL_LIFT;

        for (let attempt = 0; attempt < 40; attempt += 1) {
          const box = {
            left: left - LABEL_PAD,
            right: left + width + LABEL_PAD,
            top: bottom - LABEL_H,
            bottom,
          };
          const clash =
            placed.some((other) => overlaps(box, other)) ||
            pointBoxes.some((other) => overlaps(box, other));

          if (!clash) break;
          bottom -= LABEL_H * 0.6;
        }

        placed.push({
          left: left - LABEL_PAD,
          right: left + width + LABEL_PAD,
          top: bottom - LABEL_H,
          bottom,
        });

        const lift = pointY - LABEL_LIFT - bottom;

        return {
          point,
          name,
          value,
          flip,
          // Anchored by the edge the text grows away from, so a label whose
          // measured width beats the estimate still cannot leave the frame.
          x: flip ? 100 - ((left + width) / REF_W) * 100 : (left / REF_W) * 100,
          y: ((bottom - LABEL_H) / REF_H) * 100,
          leader:
            lift > LEADER_MIN
              ? {
                  x: ((flip ? left + width : left) / REF_W) * 100,
                  y: ((bottom - LABEL_H / 2) / REF_H) * 100,
                }
              : null,
        };
      });

    return {
      points,
      yTicks,
      xTicks,
      steps,
      labels,
      frontier,
      yMin,
      yMax,
      hasFree,
    };
  }, [scopedRows]);

  useEffect(() => {
    if (plot === null) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) => {
      if (
        current &&
        plot.points.some((point) => point.row.model.id === current)
      ) {
        return current;
      }

      const requested =
        syncPointToUrl && typeof window !== "undefined"
          ? new URL(window.location.href).searchParams.get("point")
          : null;
      if (
        requested &&
        plot.points.some((point) => point.row.model.id === requested)
      ) {
        return requested;
      }

      return (
        [...plot.points].sort(
          (a, b) =>
            b.index - a.index ||
            a.price - b.price ||
            a.row.model.name.localeCompare(b.row.model.name),
        )[0]?.row.model.id ?? null
      );
    });
  }, [plot, syncPointToUrl]);

  useEffect(() => {
    if (!syncPointToUrl || selectedId === null) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("point") === selectedId) return;
    url.searchParams.set("point", selectedId);
    window.history.replaceState(window.history.state, "", url);
  }, [selectedId, syncPointToUrl]);

  if (plot === null) {
    return (
      <div className="compare-empty">
        <p>
          No model in this view has both a listed price and a {scopeLabel}{" "}
          Index, so there is nothing to plot.
        </p>
      </div>
    );
  }

  const { points, yTicks, xTicks, steps, labels, frontier, hasFree } = plot;
  const excluded = scopedRows.length - points.length;
  const selectedPoint =
    points.find((point) => point.row.model.id === selectedId) ??
    [...points].sort((a, b) => b.index - a.index)[0]!;
  const selectedDomId = `plot-point-${selectedPoint.row.model.id}`;
  const pointDescription = `${selectedPoint.row.model.name}, ${selectedPoint.row.model.lab}. ${scopeLabel} Index ${formatScore(
    selectedPoint.index,
  )}, rank ${selectedPoint.row.scope.rank ?? "unranked"} of ${
    selectedPoint.row.scope.rankedFieldSize
  }. Input price ${
    selectedPoint.free
      ? "free"
      : `$${formatPrice(selectedPoint.price)} per million tokens`
  }. ${selectedPoint.row.model.openWeights ? "Open" : "Closed"} weights. ${
    selectedPoint.frontier
      ? "On the efficient frontier in this view."
      : "Not on the efficient frontier in this view."
  }`;

  function selectAlong(axis: "price" | "index", direction: -1 | 1) {
    const ordered = [...points].sort((a, b) => {
      const primary = axis === "price" ? a.price - b.price : a.index - b.index;
      return primary || a.row.model.name.localeCompare(b.row.model.name);
    });
    const current = ordered.findIndex(
      (point) => point.row.model.id === selectedPoint.row.model.id,
    );
    const next = Math.min(ordered.length - 1, Math.max(0, current + direction));
    setSelectedId(ordered[next]!.row.model.id);
  }

  function onPlotKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        selectAlong("price", -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        selectAlong("price", 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        selectAlong("index", -1);
        break;
      case "ArrowUp":
        event.preventDefault();
        selectAlong("index", 1);
        break;
      case "Home":
        event.preventDefault();
        setSelectedId(
          [...points].sort(
            (a, b) =>
              a.price - b.price ||
              a.row.model.name.localeCompare(b.row.model.name),
          )[0]!.row.model.id,
        );
        break;
      case "End":
        event.preventDefault();
        setSelectedId(
          [...points].sort(
            (a, b) =>
              b.price - a.price ||
              a.row.model.name.localeCompare(b.row.model.name),
          )[0]!.row.model.id,
        );
        break;
      case "Enter":
        event.preventDefault();
        recordLinkRef.current?.click();
        break;
      case "Escape":
        event.preventDefault();
        setSelectedId(
          [...points].sort((a, b) => b.index - a.index)[0]!.row.model.id,
        );
        break;
    }
  }

  return (
    <div className="plot-frame">
      <div className="plot-head">
        <h2>{scopeLabel} Index against input price</h2>
        <p className="plot-sub text-tertiary">
          {points.length} model{points.length === 1 ? "" : "s"} plotted · input
          price in USD per million tokens · positive prices use a log scale
          {hasFree ? " with a separate Free lane" : ""} · higher Index and lower
          price are better
          {excluded > 0
            ? ` · ${excluded} not plotted, with no listed price or no ${scopeLabel} Index`
            : ""}
        </p>
      </div>

      <section className="plot-inspector" aria-labelledby="plot-selection">
        <div>
          <p className="section-kicker" id="plot-selection">
            Selected model
          </p>
          <h3>{selectedPoint.row.model.name}</h3>
          <p className="text-tertiary">{selectedPoint.row.model.lab}</p>
        </div>
        <dl>
          <div>
            <dt>{scopeLabel} Index</dt>
            <dd className="num">{formatScore(selectedPoint.index)}</dd>
          </div>
          <div>
            <dt>Rank</dt>
            <dd className="num">
              {selectedPoint.row.scope.rank === null
                ? "—"
                : `${selectedPoint.row.scope.rank} / ${selectedPoint.row.scope.rankedFieldSize}`}
            </dd>
          </div>
          <div>
            <dt>Input / output</dt>
            <dd className="num">
              {selectedPoint.free
                ? "Free"
                : `$${formatPrice(selectedPoint.price)}`}{" "}
              / ${formatPrice(selectedPoint.row.model.pricing!.output)}
            </dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd>
              {selectedPoint.frontier ? "Efficient frontier" : "Inside field"}
            </dd>
          </div>
        </dl>
        <Link
          ref={recordLinkRef}
          className="btn"
          href={`/model/${selectedPoint.row.model.id}`}
          prefetch={false}
        >
          Open model record
        </Link>
      </section>
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {pointDescription}
      </p>

      <div className="plot-stage">
        <div
          className="plot-area"
          role="listbox"
          tabIndex={0}
          aria-label={`${scopeLabel} Index against input price. Use left and right arrows for price, up and down arrows for Index, and Enter to open the selected model.`}
          aria-activedescendant={selectedDomId}
          onKeyDown={onPlotKeyDown}
        >
          <svg
            className="plot-rules"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {yTicks.map((tick) => (
              <line
                key={`y${tick.value}`}
                className={tick.major ? "is-major" : undefined}
                x1="0"
                x2="100"
                y1={tick.y}
                y2={tick.y}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {xTicks.map((tick) => (
              <line
                key={`x${tick.value}`}
                className={tick.label === null ? "is-stub" : "is-major"}
                x1={tick.x}
                x2={tick.x}
                y1={tick.label === null ? 98.4 : 0}
                y2="100"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              className="is-axis"
              x1="0"
              x2="100"
              y1="100"
              y2="100"
              vectorEffect="non-scaling-stroke"
            />
            {hasFree ? (
              <path
                className="plot-axis-break"
                d={`M${FREE_LANE_END + 1} 98l1 -2l1 4l1 -2`}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <line
              className="is-axis"
              x1="0"
              x2="0"
              y1="0"
              y2="100"
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="plot-front"
              d={steps}
              vectorEffect="non-scaling-stroke"
            />
            {labels.map((label) =>
              label.leader === null ? null : (
                <line
                  key={`lead-${label.point.row.model.id}`}
                  className="plot-leader"
                  x1={label.point.x}
                  y1={label.point.y}
                  x2={label.leader.x}
                  y2={label.leader.y}
                  vectorEffect="non-scaling-stroke"
                />
              ),
            )}
          </svg>

          {yTicks
            .filter((tick) => tick.major)
            .map((tick) => (
              <span
                className="plot-y num"
                key={`yl${tick.value}`}
                style={{ top: `${tick.y}%` }}
              >
                {tick.value}
              </span>
            ))}
          {xTicks
            .filter((tick) => tick.label !== null)
            .map((tick) => (
              <span
                className="plot-x num"
                key={`xl${tick.value}`}
                style={{ left: `${tick.x}%` }}
              >
                {tick.label}
              </span>
            ))}

          {points.map((point) => {
            const selected = point.row.model.id === selectedPoint.row.model.id;
            const coordinateTies = points
              .filter(
                (candidate) =>
                  candidate.price === point.price &&
                  candidate.index === point.index,
              )
              .sort((a, b) => a.row.model.name.localeCompare(b.row.model.name));

            return (
              <span
                id={`plot-point-${point.row.model.id}`}
                role="option"
                aria-selected={selected}
                key={point.row.model.id}
                className={`plot-mark${point.row.model.openWeights ? " is-open" : ""}${
                  point.frontier ? " is-front" : ""
                }${selected ? " is-selected" : ""}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                aria-label={`${point.row.model.name}: ${scopeLabel} Index ${formatScore(
                  point.index,
                )}, ${
                  point.free
                    ? "free input"
                    : `$${formatPrice(point.price)} per million input tokens`
                }${point.row.model.openWeights ? ", open weights" : ", closed weights"}${
                  point.frontier ? ", on the efficient frontier" : ""
                }`}
                onClick={() => {
                  if (selected && coordinateTies.length > 1) {
                    const at = coordinateTies.findIndex(
                      (candidate) =>
                        candidate.row.model.id === point.row.model.id,
                    );
                    setSelectedId(
                      coordinateTies[(at + 1) % coordinateTies.length]!.row
                        .model.id,
                    );
                  } else {
                    setSelectedId(point.row.model.id);
                  }
                }}
              >
                <span
                  className={`plot-tip${point.x > 50 ? " is-flip" : ""}${
                    point.y < 14 ? " is-under" : ""
                  }`}
                  aria-hidden="true"
                >
                  {point.row.model.name}
                  <b className="num">{formatScore(point.index)}</b>
                  <i className="num">
                    {point.free ? "Free" : `$${formatPrice(point.price)}`}
                  </i>
                </span>
              </span>
            );
          })}

          {labels.map((label) => (
            <span
              className={`plot-name${label.flip ? " is-flip" : ""}${
                label.point.row.model.id === selectedPoint.row.model.id
                  ? " is-selected"
                  : ""
              }`}
              key={`name-${label.point.row.model.id}`}
              style={
                label.flip
                  ? { right: `${label.x}%`, top: `${label.y}%` }
                  : { left: `${label.x}%`, top: `${label.y}%` }
              }
            >
              {label.name}
              <b className="num">{label.value}</b>
            </span>
          ))}
        </div>
      </div>

      <p className="plot-legend text-tertiary">
        <span className="row">
          <i aria-hidden="true" /> Closed weights
        </span>
        <span className="row">
          <i className="is-open" aria-hidden="true" /> Open weights
        </span>
        <span className="row">
          <i className="is-line" aria-hidden="true" /> Efficient frontier in
          this view
        </span>
      </p>

      <details className="plot-data">
        <summary>View plotted data</summary>
        <div className="table-region" tabIndex={0}>
          <table>
            <caption>
              {scopeLabel} Index against input price for every plotted model.{" "}
              {frontier.length} models sit on the efficient frontier in this
              view.
            </caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">{scopeLabel} Index</th>
                <th scope="col">Input price / 1M</th>
                <th scope="col">Weights</th>
                <th scope="col">Efficient frontier</th>
              </tr>
            </thead>
            <tbody>
              {[...points]
                .sort(
                  (a, b) =>
                    b.index - a.index ||
                    a.row.model.name.localeCompare(b.row.model.name),
                )
                .map((point) => (
                  <tr key={point.row.model.id}>
                    <th scope="row">
                      <Link
                        href={`/model/${point.row.model.id}`}
                        prefetch={false}
                      >
                        {point.row.model.name}
                      </Link>
                    </th>
                    <td>{formatScore(point.index)}</td>
                    <td>
                      {point.free ? "Free" : `$${formatPrice(point.price)}`}
                    </td>
                    <td>{point.row.model.openWeights ? "Open" : "Closed"}</td>
                    <td>{point.frontier ? "Yes" : "No"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>

      {excluded > 0 ? (
        <details className="plot-excluded">
          <summary>Not plotted ({excluded})</summary>
          <ul>
            {scopedRows
              .filter(
                (row) => row.model.pricing == null || row.scope.index === null,
              )
              .map((row) => (
                <li key={row.model.id}>
                  <Link href={`/model/${row.model.id}`} prefetch={false}>
                    {row.model.name}
                  </Link>
                  {" — "}
                  {row.model.pricing == null
                    ? "no listed input price"
                    : `no ${scopeLabel} Index`}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
