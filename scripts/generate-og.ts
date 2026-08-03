/**
 * Generates Open Graph cards into `public/og/`.
 *
 *   npx tsx scripts/generate-og.ts
 *   npx tsx scripts/generate-og.ts --only home
 *   npx tsx scripts/generate-og.ts --only anthropic-claude-opus-5
 *
 * A full run renders and verifies the complete set in a sibling temporary
 * directory, then swaps that directory into place. A targeted run atomically
 * replaces only the requested PNG and never removes sibling cards.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

import { loadLeaderboardData } from "../src/lib/data";
import { coverageThreshold } from "../src/lib/index";
import {
  modelCard,
  siteCard,
  valueCard,
  type Card,
} from "./og/cards";
import { renderCard } from "./og/render";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputDirectory = join(root, "public", "og");
export const MINIMUM_EXPECTED_CARDS = 67;

export type OgJob = {
  path: string;
  card: () => Card;
};

export function buildOgJobs(): OgJob[] {
  const data = loadLeaderboardData();
  const { minimumCoverageCount } = coverageThreshold(data.benchmarks);

  return [
    { path: "home.png", card: () => siteCard(data) },
    {
      path: "choose.png",
      card: () =>
        siteCard(data, {
          hero: "4",
          heroLabel: "Deterministic recommendations",
          spec: [
            ["Task scopes", "5"],
            ["Access modes", "3"],
            [
              "Sourced prices",
              String(data.rows.filter((row) => row.model.pricing).length),
            ],
          ],
        }),
    },
    {
      path: "compare.png",
      card: () =>
        siteCard(data, {
          hero: String(data.benchmarks.length),
          heroLabel: "Benchmarks, side by side",
          spec: [
            ["Models", String(data.rows.length)],
            ["Cited scores", String(data.scoreCount)],
            ["Labs", String(data.labs.length)],
          ],
        }),
    },
    {
      path: "methodology.png",
      card: () =>
        siteCard(data, {
          hero: String(data.scoreCount),
          heroLabel: "Individually cited scores",
          spec: [
            ["Benchmarks", String(data.benchmarks.length)],
            [
              "Coverage bar",
              `${minimumCoverageCount}/${data.benchmarks.length}`,
            ],
            ["Vendor-reported", String(data.selfReportedCount)],
          ],
        }),
    },
    { path: "value.png", card: () => valueCard(data) },
    ...data.rows.map((row) => ({
      path: join("model", `${row.model.id}.png`),
      card: () => modelCard(row, data),
    })),
  ];
}

function targetForOnly(only: string) {
  const normalized = only
    .trim()
    .replace(/^[/\\]+/, "")
    .replace(/\\/g, "/");
  const withoutExtension =
    extname(normalized) === ".png"
      ? normalized.slice(0, -".png".length)
      : normalized;

  if (
    withoutExtension === "home" ||
    withoutExtension === "choose" ||
    withoutExtension === "compare" ||
    withoutExtension === "methodology" ||
    withoutExtension === "value"
  ) {
    return `${withoutExtension}.png`;
  }

  return withoutExtension.startsWith("model/")
    ? `${withoutExtension}.png`
    : `model/${withoutExtension}.png`;
}

export function selectOgJobs(jobs: OgJob[], only?: string): OgJob[] {
  if (!only) return jobs;

  const target = targetForOnly(only);
  const selected = jobs.filter(
    (job) => job.path.replace(/\\/g, "/") === target,
  );

  if (selected.length !== 1) {
    throw new Error(
      `Unknown OG card ${JSON.stringify(only)}. Use home, choose, compare, methodology, value, or an exact model id.`,
    );
  }

  return selected;
}

async function relativePngFiles(directory: string, current = directory) {
  const files: string[] = [];

  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await relativePngFiles(directory, path)));
    } else if (entry.isFile() && entry.name.endsWith(".png")) {
      files.push(relative(directory, path).replace(/\\/g, "/"));
    }
  }

  return files.sort();
}

function pngDimensions(buffer: Buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");

  if (signature !== "89504e470d0a1a0a" || buffer.length < 24) {
    throw new Error("not a PNG");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function verifyOgArtifacts(
  directory: string,
  jobs: OgJob[],
  minimumExpected = MINIMUM_EXPECTED_CARDS,
) {
  if (jobs.length < minimumExpected) {
    throw new Error(
      `OG generation planned ${jobs.length} cards; expected at least ${minimumExpected}.`,
    );
  }

  const expected = jobs
    .map((job) => job.path.replace(/\\/g, "/"))
    .sort();
  const actual = await relativePngFiles(directory);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    const missing = expected.filter((path) => !actualSet.has(path));
    const unexpected = actual.filter((path) => !expectedSet.has(path));
    throw new Error(
      [
        "OG artifact set is incomplete.",
        missing.length ? `Missing: ${missing.join(", ")}` : "",
        unexpected.length ? `Unexpected: ${unexpected.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  for (const path of expected) {
    const dimensions = pngDimensions(await readFile(join(directory, path)));
    if (dimensions.width !== 1200 || dimensions.height !== 630) {
      throw new Error(
        `${path} is ${dimensions.width}×${dimensions.height}; expected 1200×630.`,
      );
    }
  }
}

async function renderJobs(jobs: OgJob[], directory: string) {
  let bytes = 0;

  for (const job of jobs) {
    const png = await renderCard(job.card());
    const destination = join(directory, job.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, png);
    bytes += png.length;
  }

  return bytes;
}

async function moveDirectoryIntoPlace(
  generatedDirectory: string,
  outputDirectory: string,
) {
  const parent = dirname(outputDirectory);
  const backup = join(
    parent,
    `.${basename(outputDirectory)}-previous-${process.pid}-${Date.now()}`,
  );
  let movedPrevious = false;

  try {
    await rename(outputDirectory, backup);
    movedPrevious = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    await rename(generatedDirectory, outputDirectory);
  } catch (error) {
    if (movedPrevious) await rename(backup, outputDirectory);
    throw error;
  }

  if (movedPrevious) {
    await rm(backup, { recursive: true, force: true });
  }
}

export type GenerateOgOptions = {
  only?: string;
  outputDirectory?: string;
};

export async function generateOgCards({
  only,
  outputDirectory = defaultOutputDirectory,
}: GenerateOgOptions = {}) {
  const jobs = buildOgJobs();
  const selected = selectOgJobs(jobs, only);
  const parent = dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const generatedDirectory = await mkdtemp(join(parent, ".og-build-"));

  try {
    const bytes = await renderJobs(selected, generatedDirectory);

    if (only) {
      await verifyOgArtifacts(generatedDirectory, selected, 1);

      for (const job of selected) {
        const source = join(generatedDirectory, job.path);
        const destination = join(outputDirectory, job.path);
        await mkdir(dirname(destination), { recursive: true });
        // Same-filesystem rename is atomic for the individual card. Existing
        // siblings are never removed or traversed.
        await rename(source, destination);
      }
    } else {
      await verifyOgArtifacts(
        generatedDirectory,
        jobs,
        MINIMUM_EXPECTED_CARDS,
      );
      await moveDirectoryIntoPlace(generatedDirectory, outputDirectory);
    }

    return { count: selected.length, bytes, outputDirectory };
  } finally {
    // After a successful full swap this path no longer exists; after any
    // failure it contains only the incomplete candidate generation.
    await rm(generatedDirectory, { recursive: true, force: true });
  }
}

function readOnlyArgument(argv: string[]) {
  const index = argv.indexOf("--only");
  if (index === -1) return undefined;

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(
      "--only requires home, choose, compare, methodology, value, or a model id.",
    );
  }

  return value;
}

async function main() {
  const result = await generateOgCards({
    only: readOnlyArgument(process.argv.slice(2)),
  });

  process.stdout.write(
    `OG cards: ${result.count} written to public/og (${(result.bytes / 1024 / 1024).toFixed(1)} MB)\n`,
  );
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
