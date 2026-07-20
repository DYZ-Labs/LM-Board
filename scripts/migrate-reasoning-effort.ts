import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ScoresFileSchema } from "../src/lib/schema";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const scoresPath = path.join(projectRoot, "data/scores.json");
const reasoningEffortSuffix = /; model: ([^;]+)$/;

async function main() {
  const scores = ScoresFileSchema.parse(
    JSON.parse(await readFile(scoresPath, "utf8")),
  );
  let migratedCount = 0;

  const migratedScores = scores.map((score) => {
    if (!score.settings) {
      return score;
    }

    const match = reasoningEffortSuffix.exec(score.settings);
    if (!match || match.index === undefined) {
      return score;
    }

    const reasoningEffort = match[1].trim();
    const settings = score.settings.slice(0, match.index).trimEnd();

    if (!settings) {
      throw new Error(
        `Cannot remove the reasoning-effort suffix from ${score.modelId}::${score.benchmarkId}: settings would be empty`,
      );
    }

    if (
      score.reasoningEffort !== undefined &&
      score.reasoningEffort !== reasoningEffort
    ) {
      throw new Error(
        `Conflicting reasoningEffort for ${score.modelId}::${score.benchmarkId}`,
      );
    }

    const { selfReported, ...scoreWithoutReportingFlag } = score;
    migratedCount += 1;

    return {
      ...scoreWithoutReportingFlag,
      settings,
      reasoningEffort,
      selfReported,
    };
  });

  ScoresFileSchema.parse(migratedScores);
  await writeFile(
    scoresPath,
    `${JSON.stringify(migratedScores, null, 2)}\n`,
    "utf8",
  );

  console.log(`Migrated ${migratedCount} reasoning-effort settings.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
