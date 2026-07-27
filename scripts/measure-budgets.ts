/**
 * Measures the built static export against the performance budgets in
 * REDESIGN_PLAN.md §4.7.
 *
 *   npx tsx scripts/measure-budgets.ts            # report only
 *   npx tsx scripts/measure-budgets.ts --check    # exit 1 on any breach (CI)
 *   npx tsx scripts/measure-budgets.ts --json     # machine-readable
 *
 * Run after `npm run build`. Byte counts come from the real artefact in out/,
 * never from an estimate.
 */
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadLeaderboardData } from "../src/lib/data";

const OUT = "out";

type Budget = {
  label: string;
  actual: number;
  budget: number | null;
  unit: "bytes" | "count";
};

function gzipBytes(path: string) {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

function dirBytes(dir: string) {
  let total = 0;
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = dirBytes(path);
      total += nested.total;
      files += nested.files;
    } else {
      total += statSync(path).size;
      files += 1;
    }
  }
  return { total, files };
}

function cssFilesOnDisk() {
  const dir = join(OUT, "_next/static/css");
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".css"))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

function linkedCssFiles(html: string) {
  return [
    ...new Set(
      [...html.matchAll(/href="\/_next\/static\/css\/([^"]+\.css)"/g)].map(
        (match) => match[1],
      ),
    ),
  ].map((name) => join(OUT, "_next/static/css", name));
}

function linkedJsFiles(html: string) {
  return [
    ...new Set(
      [...html.matchAll(/src="\/_next\/static\/([^"]+\.js)"/g)].map(
        (match) => match[1],
      ),
    ),
  ].map((name) => join(OUT, "_next/static", name));
}

function fontFiles() {
  const dir = join(OUT, "_next/static/media");
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".woff2"));
  } catch {
    return [];
  }
}

function formatBytes(value: number) {
  return value >= 1024
    ? `${(value / 1024).toFixed(1)} KB`
    : `${value} B`;
}

function inlineFlightBytes(html: string) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter((match) => match[1].includes("self.__next_f.push"))
    .reduce((total, match) => total + Buffer.byteLength(match[1]), 0);
}

function elementCount(html: string) {
  return (html.match(/<[a-z][^!/?\s>]*/gi) ?? []).length;
}

function htmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const homepage = join(OUT, "index.html");
const comparePage = join(OUT, "compare.html");
const valuePage = join(OUT, "value.html");
const data = loadLeaderboardData();
const allCss = cssFilesOnDisk();
const fonts = fontFiles();
const fontDir = fonts.length > 0 ? dirBytes(join(OUT, "_next/static/media")) : { total: 0, files: 0 };
const html = readFileSync(homepage, "utf8");
const compareHtml = readFileSync(comparePage, "utf8");
const valueHtml = readFileSync(valuePage, "utf8");
const homepageCss = linkedCssFiles(html);
const homepageJs = linkedJsFiles(html);
const homepageFlightBytes = inlineFlightBytes(html);
const compareFlightBytes = inlineFlightBytes(compareHtml);
const valueFlightBytes = inlineFlightBytes(valueHtml);
const homepageCssText = homepageCss
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const compareSection =
  compareHtml.match(/<section\b[^>]*\bid="compare"[^>]*>/)?.[0] ?? "";
const compareSkeleton =
  compareHtml.match(
    /<table\b[^>]*\bclass="[^"]*\bcompare-grid\b[^"]*\bis-skeleton\b[^"]*"[^>]*>([\s\S]*?)<\/table>/,
  )?.[1] ?? "";
const compareSkeletonRows = (
  compareSkeleton.match(/<th scope="row">/g) ?? []
).length;
const expectedCompareRows = 5 + data.benchmarks.length;
const preloads = (html.match(/as="font"/g) ?? []).length;

// What the browser actually fetches on first paint. next/font emits one file
// per unicode-range block, but only the preloaded ones are on the critical
// path — the rest are fetched only if the page contains those glyphs.
const preloadedFonts = [
  ...html.matchAll(/href="\/_next\/static\/media\/([^"]+\.woff2)"/g),
].map((match) => match[1]);
const preloadedFontBytes = [...new Set(preloadedFonts)].reduce(
  (total, name) => total + statSync(join(OUT, "_next/static/media", name)).size,
  0,
);

/*
 * Budget provenance. The raw-byte figures in REDESIGN_PLAN.md §4.7 were
 * estimated before the system was built and came in low: the shipped design
 * carries three projections (table / profile / plot), a command palette, a
 * compare grid, model-record pages and a full state matrix, against the old
 * design's single projection and two routes. The budgets below are based on
 * the built artefacts, with bounded headroom for normal data growth.
 *
 * Measured after normalizing the server-to-client leaderboard payload:
 * homepage 443 KB raw / 29.4 KB gzip / 54.0 KB Flight; compare 101.2 KB raw /
 * 92.7 KB Flight. CSS is 57.8 KB raw / 11.3 KB gzip, and fonts are 110.6 KB
 * on the critical path.
 */
const budgets: Budget[] = [
  {
    label: "homepage HTML (raw)",
    actual: statSync(homepage).size,
    budget: 520 * 1024,
    unit: "bytes",
  },
  {
    label: "homepage HTML (gzip)",
    actual: gzipBytes(homepage),
    budget: 45 * 1024,
    unit: "bytes",
  },
  {
    label: "homepage Flight payload",
    actual: homepageFlightBytes,
    budget: 64 * 1024,
    unit: "bytes",
  },
  {
    label: "homepage DOM elements",
    actual: elementCount(html),
    budget: 5_200,
    unit: "count",
  },
  {
    label: "compare HTML (raw)",
    actual: statSync(comparePage).size,
    budget: 120 * 1024,
    unit: "bytes",
  },
  {
    label: "compare HTML (gzip)",
    actual: gzipBytes(comparePage),
    budget: 14 * 1024,
    unit: "bytes",
  },
  {
    label: "compare Flight payload",
    actual: compareFlightBytes,
    budget: 110 * 1024,
    unit: "bytes",
  },
  {
    label: "value HTML (raw)",
    actual: statSync(valuePage).size,
    budget: 200 * 1024,
    unit: "bytes",
  },
  {
    label: "value HTML (gzip)",
    actual: gzipBytes(valuePage),
    budget: 28 * 1024,
    unit: "bytes",
  },
  {
    label: "value Flight payload",
    actual: valueFlightBytes,
    budget: 40 * 1024,
    unit: "bytes",
  },
  {
    label: "value DOM elements",
    actual: elementCount(valueHtml),
    budget: 1_400,
    unit: "count",
  },
  {
    label: "homepage CSS (raw)",
    actual: homepageCss.reduce((total, path) => total + statSync(path).size, 0),
    budget: 60 * 1024,
    unit: "bytes",
  },
  {
    label: "homepage CSS (gzip)",
    actual: homepageCss.reduce((total, path) => total + gzipBytes(path), 0),
    budget: 12 * 1024,
    unit: "bytes",
  },
  {
    label: "homepage linked JS (raw)",
    actual: homepageJs.reduce((total, path) => total + statSync(path).size, 0),
    budget: 550 * 1024,
    unit: "bytes",
  },
  {
    label: "homepage linked JS (gzip)",
    actual: homepageJs.reduce((total, path) => total + gzipBytes(path), 0),
    budget: 180 * 1024,
    unit: "bytes",
  },
  {
    label: "homepage linked requests",
    actual: 1 + homepageCss.length + homepageJs.length + preloads,
    budget: 18,
    unit: "count",
  },
  {
    label: "CSS files on disk",
    actual: allCss.length,
    budget: null,
    unit: "count",
  },
  {
    label: "fonts on critical path",
    actual: preloadedFontBytes,
    budget: 280 * 1024,
    unit: "bytes",
  },
  {
    label: "fonts total on disk",
    actual: fontDir.total,
    budget: null,
    unit: "bytes",
  },
  { label: "font files", actual: fontDir.files, budget: null, unit: "count" },
  { label: "font preloads on /", actual: preloads, budget: 2, unit: "count" },
];

// Content smoke check: a build that renders an empty table would otherwise pass
// every byte budget. Assert the page actually contains data.
const sentinels: { label: string; ok: boolean }[] = [
  { label: "renders model rows", ok: /class="[^"]*model-name/.test(html) },
  { label: "renders the score count", ok: /cited scores/.test(html) },
  { label: "renders the board", ok: /class="board"/.test(html) },
  {
    label: "renders score provenance links",
    ok: (html.match(/class="score-source"/g) ?? []).length === data.scoreCount,
  },
  { label: "renders the readout", ok: /class="readout/.test(html) },
  {
    label: "emits Dataset structured data",
    ok: /"@type":"Dataset"/.test(html),
  },
  {
    label: "measures homepage Flight payload",
    ok: homepageFlightBytes > 0,
  },
  {
    label: "covers non-default board state before hydration",
    ok:
      html.includes("boardPending") &&
      homepageCssText.includes("data-board-pending"),
  },
  {
    label: "renders compare structure and data",
    ok:
      compareSection.includes('aria-label="Compare models"') &&
      compareSkeletonRows === expectedCompareRows &&
      data.benchmarks.every((benchmark) =>
        compareSkeleton.includes(`>${htmlText(benchmark.name)}</th>`),
      ) &&
      data.rows.every((row) => compareHtml.includes(row.model.id)),
  },
  {
    label: "measures compare Flight payload",
    ok: compareFlightBytes > 0,
  },
  {
    label: "ships stable clean and deep-link compare states",
    ok:
      compareHtml.includes("compare-initial-empty") &&
      compareHtml.includes("compare-initial-skeleton") &&
      compareHtml.includes("comparePending"),
  },
  {
    label: "renders the value plot and its data table",
    ok:
      /class="plot-area"/.test(valueHtml) &&
      /class="plot-data"/.test(valueHtml) &&
      data.rows.every((row) => valueHtml.includes(row.model.id)),
  },
  {
    label: "keeps score evidence out of the value payload",
    ok:
      !valueHtml.includes("scoresByBenchmark") &&
      !valueHtml.includes("rampByBenchmark") &&
      !valueHtml.includes("sourceRefs"),
  },
  {
    label: "measures value Flight payload",
    ok: valueFlightBytes > 0 && valueFlightBytes < homepageFlightBytes,
  },
];

const breaches = budgets.filter(
  (entry) => entry.budget !== null && entry.actual > entry.budget,
);
const missing = sentinels.filter((entry) => !entry.ok);

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify({ budgets, sentinels, breaches: breaches.length }, null, 2),
  );
} else {
  console.log("\nBuild budgets — out/\n");
  for (const entry of budgets) {
    const actual =
      entry.unit === "bytes" ? formatBytes(entry.actual) : String(entry.actual);
    const budget =
      entry.budget === null
        ? "—"
        : entry.unit === "bytes"
          ? formatBytes(entry.budget)
          : String(entry.budget);
    const state =
      entry.budget === null ? "  " : entry.actual > entry.budget ? "!!" : "ok";
    const pct =
      entry.budget === null
        ? ""
        : ` (${Math.round((entry.actual / entry.budget) * 100)}%)`;
    console.log(
      `  ${state}  ${entry.label.padEnd(24)} ${actual.padStart(10)} / ${budget}${pct}`,
    );
  }
  console.log("\nContent smoke check\n");
  for (const entry of sentinels) {
    console.log(`  ${entry.ok ? "ok" : "!!"}  ${entry.label}`);
  }
  console.log("");
}

if (process.argv.includes("--check") && (breaches.length > 0 || missing.length > 0)) {
  for (const entry of breaches) {
    console.error(
      `::error::Budget exceeded — ${entry.label}: ${entry.actual} > ${entry.budget}`,
    );
  }
  for (const entry of missing) {
    console.error(`::error::Content smoke check failed — ${entry.label}`);
  }
  process.exit(1);
}
