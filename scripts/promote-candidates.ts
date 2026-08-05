import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { mapPrintedBenchmark } from "../src/lib/benchmarkMapping";
import {
  CandidateFileSchema,
  MeasurementSchema,
  MeasurementsFileSchema,
  type Candidate,
  type CandidateFile,
  type Measurement,
} from "../src/lib/schema";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const measurementsPath = path.join(projectRoot, "data/measurements.json");
const candidateDirectory = path.join(projectRoot, "data/candidates");
const SOURCE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CliOptions = {
  sourceSlug: string;
  write: boolean;
};

export type PromotionPlan = {
  measurements: Measurement[];
  additions: Measurement[];
};

function measurementFromCandidate(candidate: Candidate): Measurement {
  const mapping = mapPrintedBenchmark(
    candidate.evidence.printedBenchmarkName,
    candidate.evidence.printedConditions,
  );
  if (mapping.kind !== "accept" || mapping.benchmarkId !== candidate.benchmarkId) {
    throw new Error(
      `Accepted candidate is not promotable: printed benchmark does not map to "${candidate.benchmarkId}"`,
    );
  }

  const measurement: Measurement = {
    modelId: candidate.modelId,
    benchmarkId: candidate.benchmarkId,
    publisherId: candidate.publisherId,
    value: candidate.value,
    source: candidate.source,
    ...(candidate.settings === undefined ? {} : { settings: candidate.settings }),
    ...(candidate.harness === undefined ? {} : { harness: candidate.harness }),
    ...(candidate.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: candidate.reasoningEffort }),
    evidence: candidate.evidence,
  };
  const result = MeasurementSchema.safeParse(measurement);

  if (!result.success) {
    throw new Error(`Accepted candidate is not promotable: ${result.error.message}`);
  }

  return measurement;
}

function triple(measurement: Measurement): string {
  return `${measurement.modelId}\0${measurement.benchmarkId}\0${measurement.publisherId}`;
}

export function buildPromotionPlan(
  existing: readonly Measurement[],
  candidateFile: CandidateFile,
): PromotionPlan {
  const pending = candidateFile.candidates.filter(
    ({ review }) => review === "pending",
  );

  if (pending.length > 0) {
    throw new Error(
      `Promotion refused: source still has ${pending.length} pending candidate(s)`,
    );
  }

  const additions = candidateFile.candidates
    .filter(({ review }) => review === "accepted")
    .map(measurementFromCandidate);
  const seen = new Set(existing.map(triple));

  for (const addition of additions) {
    const key = triple(addition);
    if (seen.has(key)) {
      throw new Error(
        `Promotion refused: duplicate measurement (${addition.modelId}, ${addition.benchmarkId}, ${addition.publisherId})`,
      );
    }
    seen.add(key);
  }

  const measurements = [...existing, ...additions];
  const evidenceCount = measurements.filter(
    ({ evidence }) => evidence !== undefined,
  ).length;
  if (evidenceCount > 0 && evidenceCount !== measurements.length) {
    throw new Error(
      "Promotion refused: it would mix evidence-backed and legacy measurements",
    );
  }

  const validation = MeasurementsFileSchema.safeParse(measurements);
  if (!validation.success) {
    throw new Error(`Promotion would create invalid measurements: ${validation.error.message}`);
  }

  return { measurements, additions };
}

function parseCandidateFile(input: unknown, label: string): CandidateFile {
  const result = CandidateFileSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`${label}: invalid candidate file (${result.error.message})`);
  }
  return input as CandidateFile;
}

function parseArgs(args: readonly string[]): CliOptions {
  let sourceSlug: string | null = null;
  let write = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];

    if (argument === "--write") {
      write = true;
    } else if (argument === "--source" && next !== undefined) {
      sourceSlug = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (sourceSlug === null || !SOURCE_SLUG.test(sourceSlug)) {
    throw new Error("--source must name one lowercase kebab-case candidate source");
  }

  return { sourceSlug, write };
}

async function atomicWrite(filePath: string, contents: string) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, filePath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidatePath = path.join(
    candidateDirectory,
    `${options.sourceSlug}.json`,
  );
  const [measurementsInput, candidateInput] = await Promise.all([
    readFile(measurementsPath, "utf8").then(
      (contents) => JSON.parse(contents) as unknown,
    ),
    readFile(candidatePath, "utf8").then(
      (contents) => JSON.parse(contents) as unknown,
    ),
  ]);
  const existing = MeasurementsFileSchema.parse(measurementsInput);
  const candidateFile = parseCandidateFile(candidateInput, candidatePath);
  const plan = buildPromotionPlan(existing, candidateFile);

  for (const addition of plan.additions) {
    console.log(
      `Would promote (${addition.modelId}, ${addition.benchmarkId}, ${addition.publisherId}) = ${addition.value}`,
    );
  }

  if (!options.write) {
    console.log(
      `Dry run — ${plan.additions.length} accepted candidate(s) are promotable; pass --write to update data/measurements.json.`,
    );
    return;
  }

  await atomicWrite(
    measurementsPath,
    `${JSON.stringify(plan.measurements, null, 2)}\n`,
  );
  console.log(
    `Promoted ${plan.additions.length} candidate(s) into data/measurements.json.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
