export type MappingResult =
  | { kind: "accept"; benchmarkId: string; variant?: string }
  | { kind: "reject"; reason: string }
  | { kind: "ambiguous"; question: string };

function searchable(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("τ", "tau")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function printedVariant(
  printedName: string,
  printedConditions: string | null,
  basePattern: RegExp,
): string | undefined {
  if (printedConditions !== null && printedConditions.trim() !== "") {
    return printedConditions;
  }

  const match = printedName.trim().match(basePattern);
  const suffix = match?.[1]?.trim();

  if (!suffix) return undefined;

  const unwrapped = suffix.match(/^\((.*)\)$/)?.[1];
  return unwrapped ?? suffix;
}

function combinedSearchable(
  printedName: string,
  printedConditions: string | null,
): string {
  return searchable(
    printedConditions === null
      ? printedName
      : `${printedName} ${printedConditions}`,
  );
}

/**
 * Maps only identities that vendor text proves. Similar names are deliberately
 * rejected or held for review because a plausible mapping is not evidence.
 */
export function mapPrintedBenchmark(
  printedName: string,
  printedConditions: string | null,
): MappingResult {
  const name = searchable(printedName);
  const combined = combinedSearchable(printedName, printedConditions);

  if (
    name.includes("long horizon terminal bench") ||
    name === "lhtb" ||
    name.startsWith("lhtb ")
  ) {
    return {
      kind: "reject",
      reason: "Long-Horizon-Terminal-Bench is not Terminal-Bench 2.1",
    };
  }

  if (name.includes("terminal bench")) {
    if (/\b2 1\b/.test(name)) {
      return { kind: "accept", benchmarkId: "terminal-bench-v2-1" };
    }

    return {
      kind: "reject",
      reason: "Terminal-Bench requires an explicit 2.1 version in its printed name",
    };
  }

  if (name.includes("bankertoolbench")) {
    return {
      kind: "reject",
      reason: "BankerToolBench is not tau3-Banking",
    };
  }

  const isTauBenchmark =
    /\btau(?:\s+|)bench\b/.test(name) ||
    /\btau[123](?:\s+bench|\b)/.test(name);

  if (isTauBenchmark) {
    const isTau3 =
      /\btau3(?:\s+bench|\b)/.test(name) ||
      /\btaubench\s+v?3\b/.test(name) ||
      /\btau\s+bench\s+v?3\b/.test(name);

    if (!isTau3) {
      return {
        kind: "reject",
        reason: "Only tau3 with the banking domain maps to tau3-Banking",
      };
    }

    const namesAnotherDomain =
      /\b(?:airline|retail|telecom|cross domain|aggregate|all domains?)\b/.test(
        combined,
      );

    if (!/\bbanking\b/.test(combined) || namesAnotherDomain) {
      return {
        kind: "reject",
        reason:
          "tau3 must name only the banking domain to map to tau3-Banking",
      };
    }

    return { kind: "accept", benchmarkId: "tau3-banking" };
  }

  if (/\bgpqa\b/.test(name)) {
    if (/\bdiamond\b/.test(name)) {
      return { kind: "accept", benchmarkId: "gpqa-diamond" };
    }

    return {
      kind: "reject",
      reason: "GPQA requires Diamond in its printed name",
    };
  }

  if (name.includes("agents last exam")) {
    return {
      kind: "reject",
      reason: "Agents' Last Exam is not Humanity's Last Exam",
    };
  }

  if (/\bhle\s+verified\b/.test(name)) {
    return {
      kind: "reject",
      reason: "HLE-Verified is a different dataset, not an HLE condition",
    };
  }

  const isHle = /\bhle\b/.test(name) || name.includes("humanitys last exam");

  if (isHle) {
    const hasIdentityCondition =
      /\b(?:no|with|without) tools?\b/.test(combined) ||
      /\bw (?:with )?tools?\b/.test(combined) ||
      /\bw o tools?\b/.test(combined) ||
      (/\b(?:web )?search\b/.test(combined) &&
        /\b(?:code|code execution)\b/.test(combined)) ||
      /\btext only\b/.test(combined) ||
      /\bfull(?: set)?\b/.test(combined);

    if (!hasIdentityCondition) {
      return {
        kind: "ambiguous",
        question: "Which HLE tool and dataset condition was used?",
      };
    }

    const variant = printedVariant(
      printedName,
      printedConditions,
      /^(?:HLE|Humanity[’']s Last Exam)(?:\s*[-–—:]\s*|\s+)?(.*)$/i,
    );

    return {
      kind: "accept",
      benchmarkId: "hle",
      ...(variant === undefined ? {} : { variant }),
    };
  }

  if (/\bscicode\b/.test(name)) {
    const hasResolution =
      /\bsub(?:problem|task)s?\b/.test(combined) ||
      /\bmain(?: problem| task)?s?\b/.test(combined) ||
      /\b(?:problem|challenge) level\b/.test(combined);

    if (!hasResolution) {
      return {
        kind: "ambiguous",
        question: "Does this SciCode score use main problems or subproblems?",
      };
    }

    const variant = printedVariant(
      printedName,
      printedConditions,
      /^SciCode(?:\s*[-–—:]\s*|\s+)?(.*)$/i,
    );

    return {
      kind: "accept",
      benchmarkId: "scicode",
      ...(variant === undefined ? {} : { variant }),
    };
  }

  if (/\bifeval\b/.test(name)) {
    return { kind: "reject", reason: "IFEval is not IFBench" };
  }

  if (/\bifbench\b/.test(name)) {
    return { kind: "accept", benchmarkId: "ifbench" };
  }

  if (/\bcritpt\b/.test(name)) {
    const hasLevel = /\b(?:challenge|checkpoint) level\b/.test(combined);

    if (!hasLevel) {
      return {
        kind: "ambiguous",
        question: "Is this CritPt challenge-level or checkpoint-level accuracy?",
      };
    }

    const variant = printedVariant(
      printedName,
      printedConditions,
      /^CritPt(?:\s*[-–—:]\s*|\s+)?(.*)$/i,
    );

    return {
      kind: "accept",
      benchmarkId: "critpt",
      ...(variant === undefined ? {} : { variant }),
    };
  }

  if (/\baa\s+lcr\b/.test(name)) {
    return { kind: "accept", benchmarkId: "aa-lcr" };
  }

  if (
    name.includes("aa coding agent index") ||
    name.includes("artificial analysis")
  ) {
    return {
      kind: "reject",
      reason: "This Artificial Analysis property is not AA-LCR",
    };
  }

  return {
    kind: "reject",
    reason: "Printed benchmark is not one of LM Board's curated benchmarks",
  };
}
