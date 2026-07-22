import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { ZodType } from "zod";

import { validateDataIntegrity } from "../src/lib/dataIntegrity";
import {
  BenchmarksFileSchema,
  ModelsFileSchema,
  ScoresFileSchema,
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

  const errors = validateDataIntegrity(models, benchmarks, scores);

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
