import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { ZodType } from "zod";

import {
  BenchmarksFileSchema,
  ModelsFileSchema,
  ScoresFileSchema,
  type Benchmark,
  type Model,
  type Score,
} from "../src/lib/schema";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function findDuplicateIds(records: Array<{ id: string }>, label: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      duplicates.add(record.id);
    }
    seen.add(record.id);
  }

  return [...duplicates].map((id) => `Duplicate ${label} id: ${id}`);
}

function validateRelationships(
  models: Model[],
  benchmarks: Benchmark[],
  scores: Score[],
): string[] {
  const errors = [
    ...findDuplicateIds(models, "model"),
    ...findDuplicateIds(benchmarks, "benchmark"),
  ];
  const modelIds = new Set(models.map(({ id }) => id));
  const benchmarkById = new Map(benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const scorePairs = new Set<string>();

  for (const [index, score] of scores.entries()) {
    const prefix = `scores.json[${index}]`;
    const pair = `${score.modelId}::${score.benchmarkId}`;

    if (!modelIds.has(score.modelId)) {
      errors.push(`${prefix}: unknown modelId "${score.modelId}"`);
    }

    const benchmark = benchmarkById.get(score.benchmarkId);
    if (!benchmark) {
      errors.push(`${prefix}: unknown benchmarkId "${score.benchmarkId}"`);
    } else if (
      benchmark.unit === "percent" &&
      (score.value < 0 || score.value > 100)
    ) {
      errors.push(
        `${prefix}: percent value ${score.value} must be between 0 and 100`,
      );
    }

    if (scorePairs.has(pair)) {
      errors.push(
        `${prefix}: duplicate score pair (${score.modelId}, ${score.benchmarkId})`,
      );
    }
    scorePairs.add(pair);
  }

  return errors;
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

  const errors = validateRelationships(models, benchmarks, scores);

  if (errors.length > 0) {
    throw new Error(
      `Data integrity validation failed\n${errors
        .map((error) => `  - ${error}`)
        .join("\n")}`,
    );
  }

  console.log(
    `Validated ${models.length} models, ${benchmarks.length} benchmarks, and ${scores.length} scores.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
