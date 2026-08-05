import { describe, expect, it } from "vitest";

import { deriveProvenance, resolveMeasurements } from "./provenance";
import type { Measurement, Model, Publisher } from "./schema";

const models: Model[] = ["model", "z-model", "a-model"].map((id) => ({
  id,
  name: id,
  lab: "Vendor Lab",
  releaseDate: "2026-08-01",
  openWeights: false,
  url: `https://vendor.example/${id}`,
}));

const publishers: Publisher[] = [
  {
    id: "independent-a",
    name: "Independent A",
    url: "https://independent-a.example",
    sourceHosts: ["independent-a.example"],
    type: "independent",
    runsOwnEvals: true,
  },
  {
    id: "independent-b",
    name: "Independent B",
    url: "https://independent-b.example",
    sourceHosts: ["independent-b.example"],
    type: "independent",
    runsOwnEvals: true,
  },
  {
    id: "independent-c",
    name: "Independent C",
    url: "https://independent-c.example",
    sourceHosts: ["independent-c.example"],
    type: "independent",
    runsOwnEvals: true,
  },
  {
    id: "benchmark-author",
    name: "Benchmark Author",
    url: "https://benchmark.example",
    sourceHosts: ["benchmark.example"],
    type: "benchmark-author",
    runsOwnEvals: true,
  },
  {
    id: "vendor",
    name: "Vendor",
    url: "https://vendor.example",
    sourceHosts: ["vendor.example"],
    type: "vendor",
    runsOwnEvals: true,
    vendorForLab: "Vendor Lab",
  },
  {
    id: "rival-vendor",
    name: "Rival Vendor",
    url: "https://rival-vendor.example",
    sourceHosts: ["rival-vendor.example"],
    type: "vendor",
    runsOwnEvals: true,
    vendorForLab: "Rival Lab",
  },
];

function measurement(
  publisherId: string,
  value: number,
  retrieved = "2026-08-01",
): Measurement {
  return {
    modelId: "model",
    benchmarkId: "benchmark",
    publisherId,
    value,
    source: {
      url: `https://${publisherId}.example/results`,
      retrieved,
    },
  };
}

describe("resolveMeasurements", () => {
  it("resolves a single measurement without alternates or spread", () => {
    const [score] = resolveMeasurements(
      [measurement("independent-a", 80)],
      publishers,
      models,
    );

    expect(score).toMatchObject({
      publisherId: "independent-a",
      value: 80,
      publisher: publishers[0],
      alternates: [],
      spread: null,
      unverified: false,
    });
  });

  it("prefers an independent measurement over a vendor measurement", () => {
    const [score] = resolveMeasurements(
      [
        measurement("vendor", 95, "2026-08-05"),
        measurement("independent-a", 85, "2026-07-01"),
      ],
      publishers,
      models,
    );

    expect(score.publisherId).toBe("independent-a");
    expect(score.alternates[0]?.publisherId).toBe("vendor");
    expect(score.spread).toBe(10);
  });

  it("orders all four provenance classes by the published precedence", () => {
    const [score] = resolveMeasurements(
      [
        measurement("vendor", 95),
        measurement("rival-vendor", 92),
        measurement("benchmark-author", 90),
        measurement("independent-a", 85),
      ],
      publishers,
      models,
    );

    expect([
      score.publisherId,
      ...score.alternates.map(({ publisherId }) => publisherId),
    ]).toEqual([
      "independent-a",
      "benchmark-author",
      "rival-vendor",
      "vendor",
    ]);
    expect([
      score.provenance,
      ...score.alternates.map(({ provenance }) => provenance),
    ]).toEqual([
      "independent",
      "benchmark-author",
      "competitor-reported",
      "self-reported",
    ]);
  });

  it("prefers the newest measurement when publisher types match", () => {
    const [score] = resolveMeasurements(
      [
        measurement("independent-a", 80, "2026-08-01"),
        measurement("independent-b", 82, "2026-08-02"),
      ],
      publishers,
      models,
    );

    expect(score.publisherId).toBe("independent-b");
    expect(score.alternates[0]?.publisherId).toBe("independent-a");
  });

  it("breaks a full three-way tie by publisherId", () => {
    const [score] = resolveMeasurements(
      [
        measurement("independent-b", 82),
        measurement("independent-c", 84),
        measurement("independent-a", 80),
      ],
      publishers,
      models,
    );

    expect(score.publisherId).toBe("independent-a");
    expect(score.alternates.map(({ publisherId }) => publisherId)).toEqual([
      "independent-b",
      "independent-c",
    ]);
  });

  it("marks a vendor-only cell unverified", () => {
    const [score] = resolveMeasurements(
      [measurement("vendor", 95)],
      publishers,
      models,
    );

    expect(score.unverified).toBe(true);
    expect(score.publisher.type).toBe("vendor");
    expect(score.provenance).toBe("self-reported");
    expect(score.spread).toBeNull();
  });

  it("derives competitor reporting from the publisher and model labs", () => {
    expect(deriveProvenance(publishers[4]!, models[0]!)).toBe("self-reported");
    expect(deriveProvenance(publishers[5]!, models[0]!)).toBe(
      "competitor-reported",
    );
  });

  it("preserves first-seen cell traversal while resolving within each cell", () => {
    const laterIdFirst = {
      ...measurement("independent-a", 80),
      modelId: "z-model",
    };
    const earlierIdSecond = {
      ...measurement("independent-a", 82),
      modelId: "a-model",
    };

    expect(
      resolveMeasurements(
        [laterIdFirst, earlierIdSecond],
        publishers,
        models,
      ).map(({ modelId }) => modelId),
    ).toEqual(["z-model", "a-model"]);
  });
});
