import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CandidateFileSchema,
  type Candidate,
  type CandidateFile,
} from "../src/lib/schema";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const candidateDirectory = path.join(projectRoot, "data/candidates");
const SOURCE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ReviewDecision = "accepted" | "rejected";

type CliOptions = {
  sourceSlug: string | null;
  resume: boolean;
};

function parseCandidateFile(input: unknown, label: string): CandidateFile {
  const result = CandidateFileSchema.safeParse(input);

  if (!result.success) {
    throw new Error(`${label}: invalid candidate file (${result.error.message})`);
  }

  // Validation trims for emptiness checks, but the raw quote remains the audit
  // artifact and must survive a review rewrite byte-for-byte as parsed JSON text.
  return input as CandidateFile;
}

export function formatCandidateForReview(
  candidate: Candidate,
  position: number,
  total: number,
): string {
  return [
    "",
    `[${position}/${total}]`,
    `Model: ${candidate.modelId}`,
    `Benchmark: ${candidate.benchmarkId}`,
    `Value: ${candidate.value}`,
    `Publisher: ${candidate.publisherId}`,
    `Quote: ${candidate.evidence.quote}`,
    `Printed benchmark: ${candidate.evidence.printedBenchmarkName}`,
    `Printed conditions: ${candidate.evidence.printedConditions ?? "(none)"}`,
    `Column header: ${candidate.evidence.printedColumnHeader ?? "(none)"}`,
    `Source: ${candidate.source.url}`,
  ].join("\n");
}

export function applyReviewDecision(
  file: CandidateFile,
  candidateIndex: number,
  decision: ReviewDecision,
  note: string | null,
): CandidateFile {
  const candidate = file.candidates[candidateIndex];
  if (candidate === undefined) {
    throw new Error(`Candidate index ${candidateIndex} is out of range`);
  }
  if (candidate.review !== "pending") {
    throw new Error(`Candidate index ${candidateIndex} is already ${candidate.review}`);
  }

  const candidates = file.candidates.map((entry, index) => {
    if (index !== candidateIndex) return entry;
    return {
      ...entry,
      review: decision,
      ...(note === null || note.trim() === ""
        ? {}
        : { reviewNote: note.trim() }),
    };
  });
  const updated = { ...file, candidates };
  const validation = CandidateFileSchema.safeParse(updated);

  if (!validation.success) {
    throw new Error(`Review decision produced invalid data: ${validation.error.message}`);
  }

  return updated;
}

async function writeCandidateFile(filePath: string, file: CandidateFile) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { sourceSlug: null, resume: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];

    if (argument === "--resume") {
      options.resume = true;
    } else if (argument === "--source" && next !== undefined) {
      if (!SOURCE_SLUG.test(next)) {
        throw new Error("--source must be a lowercase kebab-case source slug");
      }
      options.sourceSlug = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  return options;
}

async function candidatePaths(sourceSlug: string | null): Promise<string[]> {
  if (sourceSlug !== null) {
    return [path.join(candidateDirectory, `${sourceSlug}.json`)];
  }

  return (await readdir(candidateDirectory))
    .filter(
      (name) => name.endsWith(".json") && !name.endsWith(".skipped.json"),
    )
    .sort()
    .map((name) => path.join(candidateDirectory, name));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const paths = await candidatePaths(options.sourceSlug);
  const files = await Promise.all(
    paths.map(async (filePath) => {
      const input = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      return { filePath, file: parseCandidateFile(input, filePath) };
    }),
  );
  const pendingCount = files.reduce(
    (count, { file }) =>
      count + file.candidates.filter(({ review }) => review === "pending").length,
    0,
  );

  if (pendingCount === 0) {
    console.log("No pending candidates.");
    return;
  }

  if (options.resume) {
    console.log(`Resuming at the first of ${pendingCount} pending candidate(s).`);
  }

  const readline = createInterface({ input, output });
  let reviewed = 0;
  let stopped = false;

  try {
    for (const entry of files) {
      let current = entry.file;

      for (let index = 0; index < current.candidates.length; index += 1) {
        const candidate = current.candidates[index];
        if (candidate?.review !== "pending") continue;

        console.log(
          formatCandidateForReview(candidate, reviewed + 1, pendingCount),
        );

        let decision: ReviewDecision | null = null;
        while (decision === null) {
          const answer = (
            await readline.question("Decision [a]ccept, [r]eject, [q]uit: ")
          )
            .trim()
            .toLowerCase();

          if (answer === "a" || answer === "accept") decision = "accepted";
          else if (answer === "r" || answer === "reject") decision = "rejected";
          else if (answer === "q" || answer === "quit") {
            stopped = true;
            break;
          } else {
            console.log("Enter a, r, or q.");
          }
        }

        if (stopped || decision === null) break;
        const note = await readline.question("Review note (optional): ");
        current = applyReviewDecision(current, index, decision, note);
        await writeCandidateFile(entry.filePath, current);
        reviewed += 1;
      }

      if (stopped) break;
    }
  } finally {
    readline.close();
  }

  console.log(
    stopped
      ? `Stopped after ${reviewed} decision(s); rerun with --resume to continue.`
      : `Recorded ${reviewed} review decision(s).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
