import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { toCommandPalettePayload } from "@/lib/commandPalette";
import { loadLeaderboardData } from "@/lib/data";

const data = loadLeaderboardData();

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("command palette payload", () => {
  it("contains only compact destination tuples, never scores or citations", () => {
    const payload = toCommandPalettePayload(data.rows, data.benchmarks);
    const [models, benchmarks] = payload;
    const serialized = JSON.stringify(payload);

    expect(models).toHaveLength(data.rows.length);
    expect(benchmarks).toHaveLength(data.benchmarks.length);
    expect(models.every((tuple) => tuple.length === 4)).toBe(true);
    expect(benchmarks.every((tuple) => tuple.length === 3)).toBe(true);
    expect(models[0]).toEqual([
      data.rows[0].model.id,
      data.rows[0].model.name,
      data.rows[0].model.lab,
      data.rows[0].scopes.overall.rank,
    ]);
    expect(serialized).not.toContain("artificialanalysis.ai/models/");
    expect(serialized).not.toContain(data.rows[0].model.url);
    expect(serialized).not.toContain(data.rows[0].model.releaseDate);
  });
});

describe("global palette route coverage", () => {
  it("mounts the deferred palette without embedding its index on product routes and the 404", () => {
    const routeFiles = [
      "src/app/compare/page.tsx",
      "src/app/methodology/page.tsx",
      "src/app/model/[id]/page.tsx",
      "src/app/not-found.tsx",
    ];

    for (const routeFile of routeFiles) {
      const routeSource = source(routeFile);

      expect(routeSource, routeFile).toContain("DeferredCommandPalette");
      expect(routeSource, routeFile).not.toContain(
        "toCommandPalettePayload",
      );
    }
    expect(source("src/app/palette.json/route.ts")).toContain(
      "toCommandPalettePayload",
    );
  });

  it("derives the homepage palette from its existing client data", () => {
    expect(source("src/app/page.tsx")).not.toContain(
      "toCommandPalettePayload",
    );
    const leaderboardSource = source("src/components/Leaderboard.tsx");

    expect(leaderboardSource).toContain(
      "toCommandPalettePayload(data.rows, data.benchmarks)",
    );
    expect(leaderboardSource).toContain("DeferredCommandPalette");
  });
});
