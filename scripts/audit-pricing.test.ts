import { describe, expect, it } from "vitest";

import { auditPricing, formatPricingAudit } from "./audit-pricing";
import type { Model } from "../src/lib/schema";

function model(id: string, retrieved: string): Model {
  return {
    id,
    name: id,
    lab: "Provider",
    releaseDate: "2026-01-01",
    openWeights: false,
    pricing: {
      input: 1,
      output: 2,
      source: { url: "https://example.com/pricing", retrieved },
    },
    url: "https://example.com/model",
  };
}

describe("auditPricing", () => {
  it("treats the 30-day boundary as fresh and later checks as stale", () => {
    const audit = auditPricing(
      [model("boundary", "2026-07-04"), model("stale", "2026-07-03")],
      "2026-08-03",
    );

    expect(audit.stale.map((entry) => entry.id)).toEqual(["stale"]);
    expect(audit.ok).toBe(false);
  });

  it("ignores models without listed pricing and rejects future dates", () => {
    const unpriced = { ...model("unpriced", "2026-08-03"), pricing: undefined };
    const audit = auditPricing(
      [unpriced, model("future", "2026-08-04")],
      "2026-08-03",
    );

    expect(audit.pricedCount).toBe(1);
    expect(audit.futureDated.map((entry) => entry.id)).toEqual(["future"]);
    expect(formatPricingAudit(audit)).toContain("Future-dated checks");
  });
});
