import { resolveMeasurements } from "@/lib/provenance";
import type {
  Benchmark,
  Measurement,
  Model,
  Publisher,
} from "@/lib/schema";

export type DataIntegrityResult = {
  errors: string[];
  warnings: string[];
};

const STALE_AFTER_DAYS = 90;
const HIGH_SPREAD_THRESHOLD = 5;

function findDuplicateIds(
  records: readonly { id: string }[],
  label: string,
): string[] {
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

function dateDaysBefore(date: Date, days: number): string {
  const midnightUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - days,
  );

  return new Date(midnightUtc).toISOString().slice(0, 10);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validateDataIntegrity(
  models: readonly Model[],
  benchmarks: readonly Benchmark[],
  measurements: readonly Measurement[],
  publishers: readonly Publisher[],
  today = new Date(),
): DataIntegrityResult {
  const errors = [
    ...findDuplicateIds(models, "model"),
    ...findDuplicateIds(benchmarks, "benchmark"),
    ...findDuplicateIds(publishers, "publisher"),
  ];
  const warnings: string[] = [];
  const modelById = new Map(models.map((model) => [model.id, model]));
  const benchmarkById = new Map(
    benchmarks.map((benchmark) => [benchmark.id, benchmark]),
  );
  const publisherById = new Map(
    publishers.map((publisher) => [publisher.id, publisher]),
  );
  const measuredBenchmarkIds = new Set<string>();
  const measurementTriples = new Set<string>();
  const cells = new Map<string, Measurement[]>();
  let measurementsCanResolve =
    findDuplicateIds(publishers, "publisher").length === 0;

  for (const [index, model] of models.entries()) {
    if (!model.pricing) continue;

    const hostname = new URL(model.pricing.source.url).hostname;
    if (
      hostname === "artificialanalysis.ai" ||
      hostname.endsWith(".artificialanalysis.ai")
    ) {
      errors.push(
        `models.json[${index}].pricing.source.url: pricing must use first-party documentation, not artificialanalysis.ai`,
      );
    }

    if (model.pricing.source.retrieved < model.releaseDate) {
      errors.push(
        `models.json[${index}].pricing.source.retrieved: cannot predate model release ${model.releaseDate}`,
      );
    }
  }

  for (const [index, measurement] of measurements.entries()) {
    const prefix = `measurements.json[${index}]`;
    const cellKey = `${measurement.modelId}\0${measurement.benchmarkId}`;
    const triple = `${cellKey}\0${measurement.publisherId}`;
    const cell = cells.get(cellKey) ?? [];
    cell.push(measurement);
    cells.set(cellKey, cell);

    const model = modelById.get(measurement.modelId);
    if (model === undefined) {
      errors.push(`${prefix}: unknown modelId "${measurement.modelId}"`);
    }

    const benchmark = benchmarkById.get(measurement.benchmarkId);
    if (benchmark === undefined) {
      errors.push(
        `${prefix}: unknown benchmarkId "${measurement.benchmarkId}"`,
      );
    } else {
      measuredBenchmarkIds.add(benchmark.id);

      if (
        benchmark.unit === "percent" &&
        (measurement.value < 0 || measurement.value > 100)
      ) {
        errors.push(
          `${prefix}: percent value ${measurement.value} must be between 0 and 100`,
        );
      }
    }

    const publisher = publisherById.get(measurement.publisherId);
    if (publisher === undefined) {
      errors.push(
        `${prefix}: unknown publisherId "${measurement.publisherId}"`,
      );
      measurementsCanResolve = false;
    } else if (publisher.type === "vendor") {
      const publisherHost = new URL(publisher.url).hostname;
      const sourceHost = new URL(measurement.source.url).hostname;

      if (sourceHost !== publisherHost) {
        errors.push(
          `${prefix}.source.url: vendor publisher "${publisher.id}" must use host "${publisherHost}", not "${sourceHost}"`,
        );
      }

      if (model !== undefined && model.lab !== publisher.vendorForLab) {
        errors.push(
          `${prefix}: vendor publisher "${publisher.id}" is for lab "${publisher.vendorForLab ?? "unspecified"}", not model "${model.id}" lab "${model.lab}"`,
        );
      }
    }

    if (measurementTriples.has(triple)) {
      errors.push(
        `${prefix}: duplicate measurement (${measurement.modelId}, ${measurement.benchmarkId}, ${measurement.publisherId})`,
      );
      measurementsCanResolve = false;
    }
    measurementTriples.add(triple);
  }

  for (const benchmark of benchmarkById.values()) {
    if (!measuredBenchmarkIds.has(benchmark.id)) {
      errors.push(`Benchmark "${benchmark.id}" has no score measurements`);
    }
  }

  if (measurementsCanResolve) {
    const reasoningEffortsByModel = new Map<string, Set<string | null>>();

    for (const score of resolveMeasurements(measurements, publishers)) {
      const reasoningEfforts =
        reasoningEffortsByModel.get(score.modelId) ?? new Set();
      reasoningEfforts.add(score.reasoningEffort ?? null);
      reasoningEffortsByModel.set(score.modelId, reasoningEfforts);
    }

    for (const [modelId, reasoningEfforts] of reasoningEffortsByModel) {
      if (reasoningEfforts.size > 1) {
        errors.push(
          `Canonical scores for model "${modelId}" must all use the same reasoningEffort or all omit it`,
        );
      }
    }
  }

  const staleCutoff = dateDaysBefore(today, STALE_AFTER_DAYS);

  for (const [cellKey, cell] of [...cells].sort(([left], [right]) =>
    compareStrings(left, right),
  )) {
    const [modelId, benchmarkId] = cellKey.split("\0");
    const cellLabel = `(${modelId}, ${benchmarkId})`;
    const cellPublishers = cell.map((measurement) =>
      publisherById.get(measurement.publisherId),
    );

    if (
      cellPublishers.every(
        (publisher) => publisher !== undefined && publisher.type === "vendor",
      )
    ) {
      warnings.push(
        `Vendor-only cell ${cellLabel}: no independent or benchmark-author measurement`,
      );
    }

    const newestRetrieved = cell.reduce(
      (newest, measurement) =>
        measurement.source.retrieved > newest
          ? measurement.source.retrieved
          : newest,
      "",
    );

    if (newestRetrieved < staleCutoff) {
      warnings.push(
        `Stale cell ${cellLabel}: newest retrieval ${newestRetrieved} is more than ${STALE_AFTER_DAYS} days old`,
      );
    }

    if (cell.length > 1) {
      const values = cell.map(({ value }) => value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const spread = max - min;

      if (spread > HIGH_SPREAD_THRESHOLD) {
        warnings.push(
          `High-spread cell ${cellLabel}: publisher measurements span ${spread} points (${min} to ${max})`,
        );
      }
    }
  }

  return { errors, warnings };
}
