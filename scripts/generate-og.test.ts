import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadLeaderboardData } from "../src/lib/data";
import {
  buildOgJobs,
  generateOgCards,
  MINIMUM_EXPECTED_CARDS,
  selectOgJobs,
  verifyOgArtifacts,
} from "./generate-og";
import { audit } from "./og/render";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("OG generation plan", () => {
  it("covers all five site cards and every model record exactly once", () => {
    const data = loadLeaderboardData();
    const jobs = buildOgJobs();
    const paths = jobs.map((job) => job.path.replace(/\\/g, "/"));

    expect(jobs).toHaveLength(data.rows.length + 5);
    expect(jobs.length).toBeGreaterThanOrEqual(MINIMUM_EXPECTED_CARDS);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("home.png");
    expect(paths).toContain("compare.png");
    expect(paths).toContain("choose.png");
    expect(paths).toContain("methodology.png");
    expect(paths).toContain("value.png");
    for (const row of data.rows) {
      expect(paths).toContain(`model/${row.model.id}.png`);
    }
  });

  it("requires an exact --only selector", () => {
    const jobs = buildOgJobs();
    const row = loadLeaderboardData().rows[0];

    expect(selectOgJobs(jobs, "home").map((job) => job.path)).toEqual([
      "home.png",
    ]);
    expect(selectOgJobs(jobs, "choose").map((job) => job.path)).toEqual([
      "choose.png",
    ]);
    expect(selectOgJobs(jobs, "value").map((job) => job.path)).toEqual([
      "value.png",
    ]);
    expect(
      selectOgJobs(jobs, row.model.id).map((job) =>
        job.path.replace(/\\/g, "/"),
      ),
    ).toEqual([`model/${row.model.id}.png`]);
    expect(() => selectOgJobs(jobs, row.model.id.slice(0, 8))).toThrow(
      /Unknown OG card/,
    );
  });

  it("gives Value a price-versus-performance card rather than Compare copy", () => {
    const card = buildOgJobs()
      .find((job) => job.path === "value.png")!
      .card();

    expect(card.alt).toContain("provider-listed input-token price");
    expect(card.alt).toContain("LM Index");
    expect(card.alt).toContain("best-value line");
    expect(card.alt).not.toContain("side by side");
  });

  it("keeps every generic route card inside the audited geometry", () => {
    const siteCards = buildOgJobs().filter((job) => !job.path.startsWith("model/"));

    for (const job of siteCards) {
      expect(audit(job.card()), job.path).toEqual([]);
    }
  });

  it("fails verification before accepting an unexpectedly small full set", async () => {
    await expect(
      verifyOgArtifacts("/does/not/matter", buildOgJobs().slice(0, 3)),
    ).rejects.toThrow(/expected at least/);
  });
});

describe("targeted OG generation", () => {
  it("replaces only the selected card and preserves sibling files", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "lmboard-og-test-"));
    temporaryDirectories.push(temporary);
    const output = join(temporary, "og");
    const sibling = join(output, "model", "keep-me.png");
    const marker = Buffer.from("existing sibling");
    await mkdir(join(output, "model"), { recursive: true });
    await writeFile(sibling, marker);

    const result = await generateOgCards({
      only: "home",
      outputDirectory: output,
    });
    const generated = await readFile(join(output, "home.png"));

    expect(result.count).toBe(1);
    expect(await readFile(sibling)).toEqual(marker);
    expect(generated.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
    expect(generated.readUInt32BE(16)).toBe(1200);
    expect(generated.readUInt32BE(20)).toBe(630);
  });
});
