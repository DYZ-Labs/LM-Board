import { describe, expect, it } from "vitest";

import {
  mapPrintedBenchmark,
  type MappingResult,
} from "./benchmarkMapping";

type Case = readonly [
  printedName: string,
  printedConditions: string | null,
  expected: MappingResult["kind"],
  benchmarkId?: string,
];

function expectCases(cases: readonly Case[]) {
  for (const [printedName, printedConditions, kind, benchmarkId] of cases) {
    const result = mapPrintedBenchmark(printedName, printedConditions);
    expect(result, `${printedName} / ${printedConditions ?? "no conditions"}`).toMatchObject({
      kind,
      ...(benchmarkId === undefined ? {} : { benchmarkId }),
    });
  }
}

describe("mapPrintedBenchmark", () => {
  it("requires Terminal-Bench 2.1 and rejects adjacent versions and lineages", () => {
    expectCases([
      ["Terminal-Bench 2.1", null, "accept", "terminal-bench-v2-1"],
      ["Terminal Bench 2.1", null, "accept", "terminal-bench-v2-1"],
      ["Terminal-Bench 2.0", null, "reject"],
      ["Terminal Bench 2", null, "reject"],
      ["Terminal Bench 2.0-Terminus", null, "reject"],
      ["Terminal-Bench", null, "reject"],
      ["Terminal-Bench 2.0 (Terminus-2)", null, "reject"],
      ["Terminal Bench 2.0 (Acc)", null, "reject"],
      ["Long-Horizon-Terminal-Bench", null, "reject"],
      ["LHTB", null, "reject"],
    ]);
  });

  it("requires both tau3 and an explicit banking domain", () => {
    expectCases([
      ["τ³-Banking", null, "accept", "tau3-banking"],
      ["TauBench V3", "Banking", "accept", "tau3-banking"],
      ["TAU3-Bench", null, "reject"],
      ["𝜏³-Bench", null, "reject"],
      ["τ2-bench", null, "reject"],
      ["Tau2-Bench Telecom", null, "reject"],
      ["τ-bench v1 Banking", null, "reject"],
      ["TAU-bench", null, "reject"],
      ["Tau-Bench", "Retail", "reject"],
      ["TAU3-Bench Telecom", null, "reject"],
      ["TAU3-Bench", "Banking and Retail aggregate", "reject"],
      ["BankerToolBench", null, "reject"],
    ]);
  });

  it("requires the GPQA Diamond subset", () => {
    expectCases([
      ["GPQA Diamond", null, "accept", "gpqa-diamond"],
      ["GPQA-Diamond", null, "accept", "gpqa-diamond"],
      ["GPQA", null, "reject"],
      ["GPQA Main", null, "reject"],
      ["GPQA (no tools)", null, "reject"],
    ]);
  });

  it("preserves printed HLE variants and holds absent conditions for review", () => {
    expectCases([
      ["HLE", null, "ambiguous"],
      ["Humanity's Last Exam", null, "ambiguous"],
      ["HLE (no tools)", null, "accept", "hle"],
      ["HLE w/ tool", null, "accept", "hle"],
      ["HLE w/o tools", null, "accept", "hle"],
      ["HLE-Full", null, "accept", "hle"],
      ["HLE-Full (w/ tools)", null, "accept", "hle"],
      ["Humanity's Last Exam (no tools)", null, "accept", "hle"],
      ["Humanity's Last Exam (Text-only)", null, "accept", "hle"],
      ["HLE-Verified", null, "reject"],
      ["Agents' Last Exam", null, "reject"],
    ]);

    expect(mapPrintedBenchmark("HLE", "temperature 1, top-p 1")).toEqual({
      kind: "ambiguous",
      question: "Which HLE tool and dataset condition was used?",
    });
    expect(mapPrintedBenchmark("HLE", "with web search + code execution")).toEqual({
      kind: "accept",
      benchmarkId: "hle",
      variant: "with web search + code execution",
    });
    expect(mapPrintedBenchmark("HLE w/ tool", null)).toMatchObject({
      variant: "w/ tool",
    });
  });

  it("requires a SciCode resolution and preserves it", () => {
    expectCases([
      ["SciCode", null, "ambiguous"],
      ["SciCode (subtask)", null, "accept", "scicode"],
    ]);
    expect(mapPrintedBenchmark("SciCode", "main problems")).toEqual({
      kind: "accept",
      benchmarkId: "scicode",
      variant: "main problems",
    });
    expect(mapPrintedBenchmark("SciCode (subtask)", null)).toMatchObject({
      variant: "subtask",
    });
  });

  it("keeps IFBench separate from IFEval", () => {
    expectCases([
      ["IFBench", null, "accept", "ifbench"],
      ["IFBench (prompt loose)", null, "accept", "ifbench"],
      ["IFEval", null, "reject"],
      ["IFEval strict prompt", null, "reject"],
    ]);
  });

  it("requires the CritPt accuracy level", () => {
    expectCases([
      ["CritPt", null, "ambiguous"],
      ["CritPT", null, "ambiguous"],
      ["CritPt (no tools)", null, "ambiguous"],
      ["CritPt", "challenge-level accuracy", "accept", "critpt"],
      ["CritPT (checkpoint level)", null, "accept", "critpt"],
    ]);
  });

  it("accepts only the AA-LCR property", () => {
    expectCases([
      ["AA-LCR", null, "accept", "aa-lcr"],
      ["AA Coding Agent Index", null, "reject"],
      ["Artificial Analysis Intelligence Index", null, "reject"],
    ]);
  });
});
