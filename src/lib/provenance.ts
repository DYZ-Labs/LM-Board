import type { Measurement, Publisher } from "@/lib/schema";

export type PublishedMeasurement = Measurement & { publisher: Publisher };

export type ResolvedScore = Measurement & {
  publisher: Publisher;
  /** Every other measurement of this cell, in precedence order. */
  alternates: PublishedMeasurement[];
  /** max − min across all measurements of this cell; null when only one exists. */
  spread: number | null;
  /** True when every measurement of this cell is vendor-published. */
  unverified: boolean;
};

const PUBLISHER_PRECEDENCE: Record<Publisher["type"], number> = {
  independent: 0,
  "benchmark-author": 1,
  vendor: 2,
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePublishedMeasurements(
  left: PublishedMeasurement,
  right: PublishedMeasurement,
): number {
  return (
    PUBLISHER_PRECEDENCE[left.publisher.type] -
      PUBLISHER_PRECEDENCE[right.publisher.type] ||
    compareStrings(right.source.retrieved, left.source.retrieved) ||
    compareStrings(left.publisherId, right.publisherId)
  );
}

export function resolveMeasurements(
  measurements: readonly Measurement[],
  publishers: readonly Publisher[],
): ResolvedScore[] {
  const publisherById = new Map<string, Publisher>();

  for (const publisher of publishers) {
    if (publisherById.has(publisher.id)) {
      throw new Error(`Duplicate publisher id: ${publisher.id}`);
    }

    publisherById.set(publisher.id, publisher);
  }

  const groups = new Map<string, PublishedMeasurement[]>();

  for (const measurement of measurements) {
    const publisher = publisherById.get(measurement.publisherId);

    if (publisher === undefined) {
      throw new Error(
        `Unknown publisherId "${measurement.publisherId}" for (${measurement.modelId}, ${measurement.benchmarkId})`,
      );
    }

    const key = `${measurement.modelId}\0${measurement.benchmarkId}`;
    const group = groups.get(key) ?? [];

    if (group.some((entry) => entry.publisherId === measurement.publisherId)) {
      throw new Error(
        `Duplicate measurement publisher (${measurement.modelId}, ${measurement.benchmarkId}, ${measurement.publisherId})`,
      );
    }

    group.push({ ...measurement, publisher });
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
      unverified: ordered.every(
        ({ publisher }) => publisher.type === "vendor",
      ),
    };
  });
}
