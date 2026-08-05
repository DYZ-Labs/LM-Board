import { appendFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import type { ZodType } from "zod";

import {
  BenchmarksFileSchema,
  ModelsFileSchema,
  MeasurementsFileSchema,
} from "../src/lib/schema";
import {
  AA_MODELS_ENDPOINT,
  buildScaffolds,
  buildSeedLedger,
  classifyNew,
  countNewIds,
  diffAgainstLedger,
  LedgerFileSchema,
  MAX_NEW_MODELS_PER_RUN,
  parseAaModels,
  renderDryRunReport,
  renderPrBody,
  renderPrTitle,
  renderSeedReport,
  type AaModel,
} from "./discovery/core";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = "data/upstream-seen.json";
const MODELS_PATH = "data/models.json";

const USAGE = `Usage: npm run discover:models -- [options]

Detects Artificial Analysis models the leaderboard has never seen and
scaffolds models.json entries for review. Dry-run by default.

Options:
  --seed             Build the initial data/upstream-seen.json ledger from
                     the current data files instead of discovering
  --write            Apply changes to the data files (otherwise print only)
  --report <path>    Write the PR body markdown to <path>
  --from <path>      Read the AA response from a JSON file instead of the API

Requires AA_API_KEY (free key from https://artificialanalysis.ai/) unless
--from is used; .env.local is loaded automatically when present.`;

interface JsonFile<T> {
  raw: unknown;
  parsed: T;
}

async function loadJson<T>(relativePath: string, schema: ZodType<T>): Promise<JsonFile<T>> {
  const raw: unknown = JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );

  return { raw, parsed: schema.parse(raw) };
}

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  await writeFile(
    path.join(projectRoot, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function ledgerExists(): Promise<boolean> {
  try {
    await readFile(path.join(projectRoot, LEDGER_PATH), "utf8");

    return true;
  } catch {
    return false;
  }
}

async function fetchAaModels(fromPath: string | undefined): Promise<AaModel[]> {
  if (fromPath !== undefined) {
    const raw: unknown = JSON.parse(await readFile(path.resolve(fromPath), "utf8"));

    return parseAaModels(raw);
  }

  const apiKey = process.env.AA_API_KEY;

  if (apiKey === undefined || apiKey === "") {
    throw new Error(
      "AA_API_KEY is not set. Create a free key at https://artificialanalysis.ai/, add it to .env.local, or pass --from <file>.",
    );
  }

  let response: Response | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      response = await fetch(AA_MODELS_ENDPOINT, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(30_000),
      });

      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;

      if (!retryable || attempt === 2) break;
    } catch (error) {
      if (attempt === 2) throw error;
    }

    console.warn("Artificial Analysis API request failed; retrying once.");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  if (response === undefined) {
    throw new Error("Artificial Analysis API request failed after retry.");
  }

  if (!response.ok) {
    throw new Error(
      `Artificial Analysis API request failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return parseAaModels(await response.json());
}

function setGithubOutput(name: string, value: string | number): void {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (outputPath !== undefined && outputPath !== "") {
    appendFileSync(outputPath, `${name}=${value}\n`);
  }
}

async function runSeed(write: boolean, fromPath: string | undefined): Promise<void> {
  if (write && (await ledgerExists())) {
    throw new Error(
      `${LEDGER_PATH} already exists — seeding would overwrite curation history. Delete it first if you really mean to re-seed.`,
    );
  }

  const [models, scores, aaModels] = await Promise.all([
    loadJson(MODELS_PATH, ModelsFileSchema),
    loadJson("data/measurements.json", MeasurementsFileSchema),
    fetchAaModels(fromPath),
  ]);

  const seed = buildSeedLedger(aaModels, models.parsed, scores.parsed, today());

  LedgerFileSchema.parse(seed.ledger);
  console.log(renderSeedReport(seed));

  if (write) {
    await writeJson(LEDGER_PATH, seed.ledger);
    console.log(`\nWrote ${LEDGER_PATH} with ${seed.ledger.entries.length} entries.`);
  } else {
    console.log("\nDry run — pass --write to create the ledger.");
  }
}

async function runDiscover(
  write: boolean,
  fromPath: string | undefined,
  reportPath: string | undefined,
): Promise<void> {
  if (!(await ledgerExists())) {
    throw new Error(
      `${LEDGER_PATH} not found — run \`npm run discover:models -- --seed --write\` once before discovering.`,
    );
  }

  const [models, benchmarks, ledger, aaModels] = await Promise.all([
    loadJson(MODELS_PATH, ModelsFileSchema),
    loadJson("data/benchmarks.json", BenchmarksFileSchema),
    loadJson(LEDGER_PATH, LedgerFileSchema),
    fetchAaModels(fromPath),
  ]);

  const newModels = diffAgainstLedger(aaModels, ledger.parsed);

  if (newModels.length > MAX_NEW_MODELS_PER_RUN) {
    throw new Error(
      `${newModels.length} new upstream ids exceed the safety cap of ${MAX_NEW_MODELS_PER_RUN} — upstream likely regenerated its ids. Nothing was written. New slugs: ${newModels
        .map((aaModel) => aaModel.slug)
        .join(", ")}`,
    );
  }

  const classification = classifyNew(newModels, ledger.parsed);
  const result = buildScaffolds(classification, ledger.parsed, models.parsed, today());
  const newCount = countNewIds(result);

  console.log(renderDryRunReport(result, classification));

  if (newCount > 0 && write) {
    const rawModels = models.raw as unknown[];
    const rawLedger = ledger.raw as { entries: unknown[] };

    await writeJson(MODELS_PATH, [
      ...rawModels,
      ...result.scaffolds.map((scaffold) => scaffold.model),
    ]);
    await writeJson(LEDGER_PATH, {
      ...(ledger.raw as object),
      entries: [...rawLedger.entries, ...result.ledgerRows],
    });

    console.log(
      `\nAppended ${result.scaffolds.length} model(s) to ${MODELS_PATH} and ${result.ledgerRows.length} entr${
        result.ledgerRows.length === 1 ? "y" : "ies"
      } to ${LEDGER_PATH}.`,
    );
  } else if (newCount > 0) {
    console.log("\nDry run — pass --write to apply.");
  }

  if (reportPath !== undefined) {
    await writeFile(
      path.resolve(reportPath),
      renderPrBody(result, classification, benchmarks.parsed, today()),
      "utf8",
    );
    console.log(`Wrote PR body to ${reportPath}.`);
  }

  setGithubOutput("new_count", newCount);
  setGithubOutput("scaffold_count", result.scaffolds.length);
  setGithubOutput("pr_title", renderPrTitle(result, today()));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(path.join(projectRoot, ".env.local"));
  } catch {
    // .env.local is optional
  }

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      seed: { type: "boolean", default: false },
      write: { type: "boolean", default: false },
      report: { type: "string" },
      from: { type: "string" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);

    return;
  }

  if (values.seed) {
    await runSeed(values.write, values.from);
  } else {
    await runDiscover(values.write, values.from, values.report);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(`\n${USAGE}`);
  process.exitCode = 1;
});
