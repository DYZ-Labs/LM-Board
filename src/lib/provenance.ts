import type { Measurement, Model, Publisher } from "@/lib/schema";

export type Provenance =
  | "independent"
  | "benchmark-author"
  | "competitor-reported"
  | "self-reported";

export type PublishedMeasurement = Measurement & {
  publisher: Publisher;
  provenance: Provenance;
};

export type ResolvedScore = PublishedMeasurement & {
  /** Every other measurement of this cell, in precedence order. */
  alternates: PublishedMeasurement[];
  /** max − min across all measurements of this cell; null when only one exists. */
  spread: number | null;
  /** True when every measurement of this cell is vendor-published. */
  unverified: boolean;
};

const PROVENANCE_PRECEDENCE: Record<Provenance, number> = {
  independent: 0,
  "benchmark-author": 1,
  "competitor-reported": 2,
  "self-reported": 3,
};

export function deriveProvenance(
  publisher: Publisher,
  model: Model,
): Provenance {
  if (publisher.type !== "vendor") return publisher.type;
  if (publisher.vendorForLab === undefined) {
    throw new Error(`Vendor publisher "${publisher.id}" has no vendorForLab`);
  }

  return publisher.vendorForLab === model.lab
    ? "self-reported"
    : "competitor-reported";
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePublishedMeasurements(
  left: PublishedMeasurement,
  right: PublishedMeasurement,
): number {
  return (
    PROVENANCE_PRECEDENCE[left.provenance] -
      PROVENANCE_PRECEDENCE[right.provenance] ||
    compareStrings(right.source.retrieved, left.source.retrieved) ||
    compareStrings(left.publisherId, right.publisherId)
  );
}

export function resolveMeasurements(
  measurements: readonly Measurement[],
  publishers: readonly Publisher[],
  models: readonly Model[],
): ResolvedScore[] {
  const publisherById = new Map<string, Publisher>();
  const modelById = new Map<string, Model>();

  for (const publisher of publishers) {
    if (publisherById.has(publisher.id)) {
      throw new Error(`Duplicate publisher id: ${publisher.id}`);
    }

    publisherById.set(publisher.id, publisher);
  }

  for (const model of models) {
    if (modelById.has(model.id)) {
      throw new Error(`Duplicate model id: ${model.id}`);
    }

    modelById.set(model.id, model);
  }

  const groups = new Map<string, PublishedMeasurement[]>();

  for (const measurement of measurements) {
    const publisher = publisherById.get(measurement.publisherId);

    if (publisher === undefined) {
      throw new Error(
        `Unknown publisherId "${measurement.publisherId}" for (${measurement.modelId}, ${measurement.benchmarkId})`,
      );
    }

    const model = modelById.get(measurement.modelId);
    if (model === undefined) {
      throw new Error(
        `Unknown modelId "${measurement.modelId}" for (${measurement.modelId}, ${measurement.benchmarkId})`,
      );
    }

    const key = `${measurement.modelId}\0${measurement.benchmarkId}`;
    const group = groups.get(key) ?? [];

    if (group.some((entry) => entry.publisherId === measurement.publisherId)) {
      throw new Error(
        `Duplicate measurement publisher (${measurement.modelId}, ${measurement.benchmarkId}, ${measurement.publisherId})`,
      );
    }

    group.push({
      ...measurement,
      publisher,
      provenance: deriveProvenance(publisher, model),
    });
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const ordered = [...group].sort(comparePublishedMeasurements);
    const [canonical, ...alternates] = ordered;
    const values = ordered.map(({ value }) => value);

    return {
      ...canonical,
      alternates,
      spread:
        values.length === 1 ? null : Math.max(...values) - Math.min(...values),
      unverified: ordered.every(({ provenance }) =>
        ["competitor-reported", "self-reported"].includes(provenance),
      ),
    };
  });
}
