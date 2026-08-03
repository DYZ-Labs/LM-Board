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

function filesWithExtension(dir: string, extension: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory()
        ? filesWithExtension(path, extension)
        : entry.name.endsWith(extension)
          ? [path]
          : [];
    });
  } catch {
    return [];
  }
}

function cssFilesOnDisk() {
  // Next 15/Webpack writes `static/css`; Next 16/Turbopack writes CSS beside
  // JavaScript in `static/chunks`. Walk the asset tree instead of encoding a
  // compiler's private directory layout into the release gate.
  return filesWithExtension(join(OUT, "_next/static"), ".css");
}

function linkedStaticFiles(
  html: string,
  attribute: "href" | "src",
  directory: string,
  extension: string,
) {
  const attributes = html.matchAll(
    new RegExp(`\\b${attribute}=(["'])(.*?)\\1`, "g"),
  );
  const prefix = `/_next/static/${directory}`;
  const paths = [...attributes].flatMap((match) => {
    try {
      const pathname = new URL(match[2], "https://lmboard.invalid").pathname;
      if (!pathname.startsWith(prefix) || !pathname.endsWith(extension)) {
        return [];
      }

      return [
        join(
          OUT,
          "_next/static",
          decodeURIComponent(pathname.slice("/_next/static/".length)),
        ),
      ];
    } catch {
      return [];
    }
  });

  return [...new Set(paths)];
}

function linkedCssFiles(html: string) {
  return linkedStaticFiles(html, "href", "", ".css");
}

function linkedJsFiles(html: string) {
  const executableTags = [...html.matchAll(/<script\b[^>]*>/gi)]
    // Next 16 emits a legacy polyfill with `nomodule`. Every browser in its
    // supported matrix understands modules and therefore does not fetch or
    // execute that fallback; charging it to first-load JS overstates transfer.
    .filter((match) => !/\bnomodule\b/i.test(match[0]))
    .map((match) => match[0])
    .join("\n");
  return linkedStaticFiles(executableTags, "src", "", ".js");
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
const choosePage = join(OUT, "choose.html");
const data = loadLeaderboardData();
const allCss = cssFilesOnDisk();
const fonts = fontFiles();
const fontDir = fonts.length > 0 ? dirBytes(join(OUT, "_next/static/media")) : { total: 0, files: 0 };
const html = readFileSync(homepage, "utf8");
const compareHtml = readFileSync(comparePage, "utf8");
const chooseHtml = readFileSync(choosePage, "utf8");
const homepageCss = linkedCssFiles(html);
const homepageJs = linkedJsFiles(html);
const chooseCss = linkedCssFiles(chooseHtml);
const chooseJs = linkedJsFiles(chooseHtml);
const homepageJsSet = new Set(homepageJs);
const chooseRouteJs = chooseJs.filter((path) => !homepageJsSet.has(path));
const homepageFlightBytes = inlineFlightBytes(html);
const compareFlightBytes = inlineFlightBytes(compareHtml);
const chooseFlightBytes = inlineFlightBytes(chooseHtml);
const homepageCssText = homepageCss
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const chooseCssText = chooseCss
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
const expectedCompareRows = 4 + data.benchmarks.length;
const preloads = (html.match(/as="font"/g) ?? []).length;

// What the browser actually fetches on first paint. next/font emits one file
// per unicode-range block, but only the preloaded ones are on the critical
// path — the rest are fetched only if the page contains those glyphs.
const preloadedFonts = linkedStaticFiles(html, "href", "media/", ".woff2");
const preloadedFontBytes = preloadedFonts.reduce(
  (total, path) => total + statSync(path).size,
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
    label: "choose HTML (raw)",
    actual: statSync(choosePage).size,
    budget: 120 * 1024,
    unit: "bytes",
  },
  {
    label: "choose HTML (gzip)",
    actual: gzipBytes(choosePage),
    budget: 18 * 1024,
    unit: "bytes",
  },
  {
    label: "choose Flight payload",
    actual: chooseFlightBytes,
    budget: 48 * 1024,
    unit: "bytes",
  },
  {
    label: "choose DOM elements",
    actual: elementCount(chooseHtml),
    budget: 1_200,
    unit: "count",
  },
  {
    label: "choose route JS (gzip)",
    actual: chooseRouteJs.reduce((total, path) => total + gzipBytes(path), 0),
    budget: 24 * 1024,
    unit: "bytes",
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
    label: "homepage executable JS (raw)",
    actual: homepageJs.reduce((total, path) => total + statSync(path).size, 0),
    budget: 550 * 1024,
    unit: "bytes",
  },
  {
    label: "homepage executable JS (gzip)",
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
    label: "keeps leaderboard scores non-interactive",
    ok: !html.includes('class="score-source"'),
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
    label: "finds linked stylesheets and scripts",
    ok: homepageCss.length > 0 && homepageJs.length > 0,
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
    label: "renders chooser structure and default shortlist",
    ok:
      /<section\b[^>]*\bid="choose"[^>]*\baria-label="Choose a model"/.test(
        chooseHtml,
      ) &&
      chooseHtml.includes("Find a model for the work") &&
      /Overall(?:<!-- -->)? recommendations/.test(chooseHtml) &&
      (chooseHtml.match(/class="chooser-card"/g) ?? []).length >= 2,
  },
  {
    label: "ships all chooser task controls and price provenance",
    ok:
      ["overall", "reasoning", "coding", "math", "agentic"].every(
        (task) =>
          new RegExp(`name="task"[^>]*value="${task}"`).test(chooseHtml),
      ) &&
      chooseHtml.includes("Official pricing") &&
      chooseHtml.includes("Checked"),
  },
  {
    label: "measures chooser Flight payload and route JS",
    ok: chooseFlightBytes > 0 && chooseJs.length > 0 && chooseRouteJs.length > 0,
  },
  {
    label: "covers chooser deep links before hydration",
    ok:
      chooseHtml.includes("chooser-initial-skeleton") &&
      chooseHtml.includes("choosePending") &&
      chooseCssText.includes("data-choose-pending"),
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
