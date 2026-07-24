import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { ZodType } from "zod";

import { validateDataIntegrity } from "../src/lib/dataIntegrity";
import {
  BenchmarksFileSchema,
  ModelsFileSchema,
  ScoresFileSchema,
  type Model,
} from "../src/lib/schema";
import { LedgerFileSchema, validateLedgerConsistency } from "./discovery/core";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LEDGER_PATH = "data/upstream-seen.json";
const UPSTREAM_PLACEHOLDER_HOST = "artificialanalysis.ai";

/**
 * Model urls must point at the official vendor announcement/model card
 * (CONTRIBUTING.md); the discovery workflow scaffolds an AA-page placeholder,
 * so CI stays red on a discovery PR until every placeholder is replaced.
 * The workflow itself validates with VALIDATE_ALLOW_UPSTREAM_PLACEHOLDERS=1.
 */
function findPlaceholderUrlErrors(models: Model[]): string[] {
  if (process.env.VALIDATE_ALLOW_UPSTREAM_PLACEHOLDERS === "1") {
    return [];
  }

  return models
    .filter((model) => {
      const hostname = new URL(model.url).hostname;

      return (
        hostname === UPSTREAM_PLACEHOLDER_HOST ||
        hostname.endsWith(`.${UPSTREAM_PLACEHOLDER_HOST}`)
      );
    })
    .map(
      (model) =>
        `${model.id}: url points at ${UPSTREAM_PLACEHOLDER_HOST} — replace the discovery placeholder with the official vendor announcement/model card`,
    );
}

interface LedgerValidation {
  errors: string[];
  entryCount: number | null;
}

async function validateLedger(models: Model[]): Promise<LedgerValidation> {
  let contents: string;

  try {
    contents = await readFile(path.join(projectRoot, LEDGER_PATH), "utf8");
  } catch {
    // The ledger is created by `npm run discover:models -- --seed --write`
    // and is optional until then.
    return { errors: [], entryCount: null };
  }

  let input: unknown;

  try {
    input = JSON.parse(contents);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    return { errors: [`${LEDGER_PATH}: invalid JSON (${detail})`], entryCount: null };
  }

  const result = LedgerFileSchema.safeParse(input);

  if (!result.success) {
    return {
      errors: result.error.issues.map((issue) => {
        const location = issue.path.length > 0 ? issue.path.join(".") : "root";

        return `${LEDGER_PATH}: ${location}: ${issue.message}`;
      }),
      entryCount: null,
    };
  }

  return {
    errors: validateLedgerConsistency(result.data, models),
    entryCount: result.data.entries.length,
  };
}

async function loadJson<T>(relativePath: string, schema: ZodType<T>): Promise<T> {
  const absolutePath = path.join(projectRoot, relativePath);
  let input: unknown;

  try {
    input = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${relativePath}: could not read valid JSON (${detail})`);
  }

  const result = schema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const location = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `  - ${location}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`${relativePath}: schema validation failed\n${issues}`);
  }

  return result.data;
}

async function main() {
  const [modelsResult, benchmarksResult, scoresResult] = await Promise.allSettled([
    loadJson("data/models.json", ModelsFileSchema),
    loadJson("data/benchmarks.json", BenchmarksFileSchema),
    loadJson("data/scores.json", ScoresFileSchema),
  ]);

  const fileErrors = [modelsResult, benchmarksResult, scoresResult].flatMap(
    (result) =>
      result.status === "rejected"
        ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
        : [],
  );

  if (fileErrors.length > 0) {
    throw new Error(`Data file validation failed\n${fileErrors.join("\n")}`);
  }

  if (
    modelsResult.status !== "fulfilled" ||
    benchmarksResult.status !== "fulfilled" ||
    scoresResult.status !== "fulfilled"
  ) {
    throw new Error("Data file validation failed unexpectedly");
  }

  const models = modelsResult.value;
  const benchmarks = benchmarksResult.value;
  const scores = scoresResult.value;

  const ledger = await validateLedger(models);
  const errors = [
    ...validateDataIntegrity(models, benchmarks, scores),
    ...findPlaceholderUrlErrors(models),
    ...ledger.errors,
  ];

  if (errors.length > 0) {
    throw new Error(
      `Data integrity validation failed\n${errors
        .map((error) => `  - ${error}`)
        .join("\n")}`,
    );
  }

  const ledgerNote =
    ledger.entryCount === null ? "" : ` Upstream ledger: ${ledger.entryCount} entries.`;

  console.log(
    `Validated ${models.length} models, ${benchmarks.length} benchmarks, and ${scores.length} scores.${ledgerNote}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
