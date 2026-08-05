import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Model, Publisher } from "../src/lib/schema";
import {
  assertPublisherSourceAllowed,
  extractCandidatesFromText,
  loadExtractionSource,
} from "./extract-candidates";

const models: Model[] = [
  {
    id: "alpha-2",
    name: "Alpha 2",
    lab: "Alpha",
    releaseDate: "2026-08-01",
    openWeights: false,
    url: "https://alpha.example/alpha-2",
  },
  {
    id: "beta-pro",
    name: "Beta Pro",
    lab: "Beta",
    releaseDate: "2026-08-01",
    openWeights: false,
    url: "https://beta.example/beta-pro",
  },
];

const source = {
  sourceUrl: "https://alpha.example/results",
  retrieved: "2026-08-05",
  publisherId: "alpha",
  models,
};

const publisher: Publisher = {
  id: "alpha",
  name: "Alpha",
  url: "https://alpha.example",
  sourceHosts: ["alpha.example", "huggingface.co/alpha"],
  type: "vendor",
  runsOwnEvals: true,
  vendorForLab: "Alpha",
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("assertPublisherSourceAllowed", () => {
  it("accepts an allowlisted namespace and explains a rejection", () => {
    expect(() =>
      assertPublisherSourceAllowed(
        "https://huggingface.co/alpha/Alpha-2",
        publisher,
      ),
    ).not.toThrow();
    expect(() =>
      assertPublisherSourceAllowed(
        "https://huggingface.co/alpha-mirror/Alpha-2",
        publisher,
      ),
    ).toThrow(
      'Publisher "alpha" rejected source host "huggingface.co"; allowed sourceHosts: "alpha.example", "huggingface.co/alpha"',
    );
  });
});

describe("extractCandidatesFromText", () => {
  it("extracts every resolved Markdown model column and preserves row quotes", () => {
    const terminalRow = "| Terminal-Bench 2.1 | 88.3 | 88.8 |";
    const ifBenchRow = "| IFBench (prompt loose) | 72.1 | 71.4 |";
    const text = [
      "# Results",
      "",
      "| Benchmark | Alpha 2 | Beta Pro (max) |",
      "| --- | ---: | ---: |",
      terminalRow,
      "| GPQA | 91.0 | 90.0 |",
      "| SciCode | 30.0 | 29.0 |",
      ifBenchRow,
    ].join("\n");
    const result = extractCandidatesFromText({ ...source, text });

    expect(
      result.candidateFile.candidates.map(
        ({ modelId, benchmarkId, value, evidence }) => ({
          modelId,
          benchmarkId,
          value,
          header: evidence.printedColumnHeader,
          quote: evidence.quote,
        }),
      ),
    ).toEqual([
      {
        modelId: "alpha-2",
        benchmarkId: "terminal-bench-v2-1",
        value: 88.3,
        header: "Alpha 2",
        quote: terminalRow,
      },
      {
        modelId: "beta-pro",
        benchmarkId: "terminal-bench-v2-1",
        value: 88.8,
        header: "Beta Pro (max)",
        quote: terminalRow,
      },
      {
        modelId: "alpha-2",
        benchmarkId: "ifbench",
        value: 72.1,
        header: "Alpha 2",
        quote: ifBenchRow,
      },
      {
        modelId: "beta-pro",
        benchmarkId: "ifbench",
        value: 71.4,
        header: "Beta Pro (max)",
        quote: ifBenchRow,
      },
    ]);
    expect(
      result.candidateFile.candidates.every(({ evidence }) =>
        text.includes(evidence.quote),
      ),
    ).toBe(true);
    expect(result.skippedFile.skipped.map(({ outcome }) => outcome)).toEqual([
      "reject",
      "ambiguous",
    ]);
  });

  it("extracts simple HTML tables without normalizing the evidence quote", () => {
    const row =
      '<tr data-result="1"><td>HLE (no tools)</td><td><strong>42.5%</strong></td></tr>';
    const text = `<table><tr><th>Benchmark</th><th>Alpha 2</th></tr>${row}</table>`;
    const result = extractCandidatesFromText({ ...source, text });

    expect(result.candidateFile.candidates).toHaveLength(1);
    expect(result.candidateFile.candidates[0]).toMatchObject({
      modelId: "alpha-2",
      benchmarkId: "hle",
      value: 42.5,
      evidence: { quote: row, printedBenchmarkName: "HLE (no tools)" },
    });
    expect(text.includes(result.candidateFile.candidates[0]!.evidence.quote)).toBe(
      true,
    );
  });

  it("expands row-spanned benchmark labels and keeps each condition distinct", () => {
    const firstRow =
      "<tr><th rowspan=2>Humanity's Last Exam (full set)</th><td>No tools</td><td>42.5%</td></tr>";
    const secondRow =
      "<tr><td>Search + Code</td><td>48.2%</td></tr>";
    const text =
      `<table><tr><th>Benchmark</th><th>Notes</th><th>Alpha 2</th></tr>` +
      `${firstRow}${secondRow}</table>`;
    const result = extractCandidatesFromText({ ...source, text });

    expect(
      result.candidateFile.candidates.map(({ value, evidence }) => ({
        value,
        conditions: evidence.printedConditions,
        quote: evidence.quote,
      })),
    ).toEqual([
      { value: 42.5, conditions: "No tools", quote: firstRow },
      {
        value: 48.2,
        conditions: "Search + Code",
        quote: `${firstRow}${secondRow}`,
      },
    ]);
    expect(
      result.candidateFile.candidates.every(({ evidence }) =>
        text.includes(evidence.quote),
      ),
    ).toBe(true);
  });

  it("writes no candidates and an explicit note when no table parses", () => {
    const result = extractCandidatesFromText({
      ...source,
      text: "Alpha 2 is widely regarded as capable.",
    });

    expect(result.tableCount).toBe(0);
    expect(result.candidateFile.candidates).toEqual([]);
    expect(result.candidateFile.note).toBe(
      "No parseable comparison table was found; no values were inferred.",
    );
  });

  it("requires explicit model mapping to reference a curated model", () => {
    expect(() =>
      extractCandidatesFromText({
        ...source,
        text: [
          "| Benchmark | Unknown |",
          "| --- | ---: |",
          "| IFBench | 72.1 |",
        ].join("\n"),
        modelMap: { Unknown: "invented-model" },
      }),
    ).toThrow('unknown modelId "invented-model"');
  });
});

describe("loadExtractionSource", () => {
  it("dates a successful network fetch at fetch time", async () => {
    const fetchImpl = vi.fn(async () => new Response("fetched page"));
    const result = await loadExtractionSource(
      { url: source.sourceUrl, fromFile: null, retrieved: null },
      {
        fetchImpl: fetchImpl as typeof fetch,
        now: () => new Date("2026-08-05T23:59:59Z"),
      },
    );

    expect(result).toEqual({ text: "fetched page", retrieved: "2026-08-05" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("reads a saved page only with its human-supplied fetch date", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "lmboard-extract-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "page.md");
    await writeFile(filePath, "saved page", "utf8");

    await expect(
      loadExtractionSource({
        url: source.sourceUrl,
        fromFile: filePath,
        retrieved: null,
      }),
    ).rejects.toThrow("--retrieved YYYY-MM-DD is required");
    await expect(
      loadExtractionSource({
        url: source.sourceUrl,
        fromFile: filePath,
        retrieved: "2026-08-04",
      }),
    ).resolves.toEqual({ text: "saved page", retrieved: "2026-08-04" });
  });
});
