/**
 * The card's acceptance test: renders every model record plus the hard states,
 * and measures the rails **from the rasterised pixels** rather than from the
 * numbers the generator believed.
 *
 *   npx tsx scripts/og/verify.ts            # every record + every edge state
 *   npx tsx scripts/og/verify.ts --edges    # edge states only
 *
 * The claim it exists to prove is positional invariance: the rank line's
 * baseline, the coverage line's, the kicker's cap and the readout's ink rail
 * are the same number on every card, whatever the card says. The prototype's
 * rank baseline moved 30px between a normal record and one with no data, which
 * is the difference between an instrument and a template.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { CARD, chassis, modelCard, siteCard, type Card } from "./cards";
import { satoriFonts } from "./fonts";
import { audit } from "./render";
import { loadLeaderboardData } from "../../src/lib/data";
import type { Benchmark } from "../../src/lib/schema";
import type { LeaderboardRow } from "../../src/lib/data";

type Band = { name: string; top: number; bottom: number; left: number; right: number };

/** Tuned windows: each isolates one rail and excludes its neighbours' rules. */
const BANDS: Band[] = [
  { name: "kicker", top: 130, bottom: 160, left: 60, right: 780 },
  { name: "meta", top: 350, bottom: 382, left: 60, right: 780 },
  { name: "readout label", top: 130, bottom: 160, left: 800, right: 1140 },
  { name: "index", top: 170, bottom: 300, left: 800, right: 1140 },
  { name: "rank", top: 305, bottom: 345, left: 800, right: 1140 },
  { name: "coverage", top: 352, bottom: 382, left: 800, right: 1140 },
  { name: "value row", top: 465, bottom: 500, left: 60, right: 1140 },
  { name: "footer", top: 560, bottom: 610, left: 60, right: 1140 },
];

async function raster(card: Card) {
  const svg = await satori(chassis(card.nodes) as never, {
    width: CARD.width,
    height: CARD.height,
    fonts: satoriFonts(),
    embedFont: true,
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: CARD.width } }).render();
}

type Box = { left: number; top: number; right: number; bottom: number } | null;

function inkBox(pixels: Buffer, width: number, band: Band): Box {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (let y = band.top; y < band.bottom; y += 1) {
    for (let x = band.left; x < band.right; x += 1) {
      const i = (y * width + x) * 4;
      // The card's ground is #0b0d10 and its rules are #252b34; 62 is above
      // both and below every ink colour on the card.
      const luminance = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      if (luminance > 62) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  return right === -Infinity ? null : { left, top, right, bottom };
}

function synthetic(row: LeaderboardRow, name: string, lab: string): LeaderboardRow {
  return { ...row, model: { ...row.model, name, lab } };
}

async function main() {
  const data = loadLeaderboardData();
  const edgesOnly = process.argv.includes("--edges");
  const writeTo = process.argv.includes("--write")
    ? process.argv[process.argv.indexOf("--write") + 1]
    : null;

  if (writeTo) await mkdir(writeTo, { recursive: true });
  const byId = (id: string) => data.rows.find((row) => row.model.id === id)!;
  const first = data.rows[0];

  const wide: Benchmark[] = Array.from({ length: 12 }, (_, i) => ({
    ...data.benchmarks[i % data.benchmarks.length],
    id: `synthetic-${i}`,
    name: i === 3 ? "Multilingual Instruction Following Robustness" : data.benchmarks[i % data.benchmarks.length].name,
  }));

  const noData: LeaderboardRow = {
    ...first,
    scoresByBenchmark: Object.fromEntries(
      data.benchmarks.map((benchmark) => [benchmark.id, null]),
    ),
    scopes: {
      ...first.scopes,
      overall: { ...first.scopes.overall, index: null, rank: null, coverageCount: 0 },
    },
  };
  const lowest = [...data.rows].sort(
    (a, b) =>
      (a.scopes.overall.index ?? 0) - (b.scopes.overall.index ?? 0),
  )[0];

  // The proof card for an auto-discovered benchmark count has to be internally
  // consistent: the prototype's rendered 6/9/12-column cards all still read
  // "7 of 8 benchmarks measured", so the string that actually overflows at ten
  // or more was never exercised.
  const wideRow: LeaderboardRow = {
    ...first,
    scoresByBenchmark: Object.fromEntries(
      wide.map((benchmark, i) => [
        benchmark.id,
        i === 0 ? null : { ...data.benchmarks[0], modelId: first.model.id, benchmarkId: benchmark.id, value: 30 + i * 4, source: { url: "https://example.com", retrieved: data.lastUpdated }, selfReported: false },
      ]),
    ) as LeaderboardRow["scoresByBenchmark"],
    scopes: {
      ...first.scopes,
      overall: {
        ...first.scopes.overall,
        coverageCount: wide.length - 1,
        coverageTotal: wide.length,
      },
    },
  };

  const cases: { name: string; card: () => Card; values?: boolean }[] = [
    { name: "site", card: () => siteCard(data) },
    { name: "model", card: () => modelCard(byId("anthropic-claude-opus-5"), data) },
    {
      name: "edge-lowest",
      card: () => modelCard(lowest, data),
      values: Object.values(lowest.scoresByBenchmark).some(
        (score) => score !== null,
      ),
    },
    { name: "edge-noindex", card: () => modelCard(data.rows.find((row) => row.scopes.coding.index === null) ?? first, data, { scope: "coding" }) },
    { name: "edge-nodata", card: () => modelCard(noData, data), values: false },
    { name: "edge-tie", card: () => modelCard(first, data, { tied: true }) },
    { name: "edge-scope", card: () => modelCard(first, data, { scope: "coding" }) },
    { name: "edge-longname", card: () => modelCard(synthetic(first, "Llama 3.1 Nemotron Ultra 253B v1", "NVIDIA"), data) },
    { name: "edge-shortname", card: () => modelCard(synthetic(first, "o3", "OpenAI"), data) },
    { name: "edge-overlong", card: () => modelCard(synthetic(first, "Nemotron Ultra Reasoning Preview Query Engine Grande", "NVIDIA"), data) },
    { name: "edge-unbreakable", card: () => modelCard(synthetic(first, "MultilingualInstructionFollowingRobustnessEvaluationHarness", "Institute For Foundation Model Evaluation And Assurance"), data) },
    { name: "edge-12-benchmarks", card: () => modelCard(wideRow, data, { benchmarks: wide }) },
    { name: "site-small-field", card: () => siteCard(data, { rows: data.rows.slice(0, 3), hero: "3" }) },
  ];

  const rows = edgesOnly ? [] : data.rows;
  const results: Record<string, Record<string, string>> = {};
  const dashOnly = new Set<string>();
  let failures = 0;

  for (const testCase of [
    ...cases,
    ...rows.map((row) => ({
      name: `all-${row.model.id}`,
      card: () => modelCard(row, data),
      values: Object.values(row.scoresByBenchmark).some(
        (score) => score !== null,
      ),
    })),
  ]) {
    if (testCase.values === false) dashOnly.add(testCase.name);
    const card = testCase.card();
    const findings = audit(card);

    if (findings.length) {
      failures += 1;
      process.stdout.write(`FAIL ${testCase.name}\n  ${findings.join("\n  ")}\n`);
      continue;
    }

    const image = await raster(card);

    if (writeTo) {
      await writeFile(join(writeTo, `${testCase.name}.png`), image.asPng());
    }

    const measured: Record<string, string> = {};

    for (const band of BANDS) {
      const box = inkBox(image.pixels, image.width, band);
      measured[band.name] = box ? `${box.left},${box.top},${box.right},${box.bottom}` : "-";
    }

    results[testCase.name] = measured;
  }

  // Rails that must not move on a model card, whatever it says.
  const invariant = ["kicker", "readout label", "rank", "coverage", "value row", "footer"];
  const modelCards = Object.entries(results).filter(
    ([name]) => name !== "site" && name !== "site-small-field",
  );

  process.stdout.write(`\n${modelCards.length} model states measured\n`);

  for (const rail of invariant) {
    const seen = new Map<string, string[]>();
    // A strip of em-dashes has no glyph sitting on the value baseline, so its
    // ink bottom is a fact about the dash rather than about the rail.
    const scope =
      rail === "value row"
        ? modelCards.filter(([name]) => !dashOnly.has(name))
        : modelCards;

    for (const [name, measured] of scope) {
      const key = rail === "value row" || rail === "footer"
        ? measured[rail].split(",")[3]
        : rail === "kicker"
          ? measured[rail].split(",")[1]
          : measured[rail].split(",")[3];
      const list = seen.get(key) ?? [];
      list.push(name);
      seen.set(key, list);
    }

    const spread = [...seen.keys()].map(Number).filter((n) => !Number.isNaN(n));
    const range = spread.length ? Math.max(...spread) - Math.min(...spread) : 0;
    const verdict = range <= 1 ? "ok" : "DRIFT";
    if (range > 1) failures += 1;
    process.stdout.write(
      `  ${rail.padEnd(14)} ${verdict} range ${range}px across ${[...seen.keys()].length} value(s): ${[...seen.entries()].map(([k, v]) => `${k}×${v.length}`).join(" ")}\n`,
    );
  }

  // Optical alignment: the ink-left of every left-column and readout element.
  const railLefts = (rail: string) =>
    [...new Set(modelCards.map(([, m]) => m[rail].split(",")[0]))].sort();
  process.stdout.write(
    `  ink-left kicker ${railLefts("kicker").join("/")} · meta ${railLefts("meta").join("/")} · index ${railLefts("index").join("/")} · rank ${railLefts("rank").join("/")} · coverage ${railLefts("coverage").join("/")}\n`,
  );

  process.stdout.write(failures ? `\n${failures} failure(s)\n` : "\nno findings\n");
  process.exitCode = failures ? 1 : 0;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
