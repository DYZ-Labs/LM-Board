import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ModelsFileSchema, type Model } from "../src/lib/schema";

const DAY_MS = 86_400_000;
const DEFAULT_MAX_AGE_DAYS = 30;

export type PricingAuditEntry = {
  id: string;
  name: string;
  retrieved: string;
  sourceUrl: string;
  ageDays: number;
};

export type PricingAudit = {
  asOf: string;
  maxAgeDays: number;
  pricedCount: number;
  stale: PricingAuditEntry[];
  futureDated: PricingAuditEntry[];
  ok: boolean;
};

function parseIsoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} is not a valid date`);
  return timestamp;
}

export function auditPricing(
  models: Model[],
  asOf: string,
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
): PricingAudit {
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 0) {
    throw new Error("maxAgeDays must be a non-negative integer");
  }

  const asOfTimestamp = parseIsoDate(asOf, "asOf");
  const entries = models
    .filter((model) => model.pricing !== undefined)
    .map((model) => {
      const pricing = model.pricing!;
      const retrievedTimestamp = parseIsoDate(
        pricing.source.retrieved,
        `${model.id} pricing retrieval`,
      );

      return {
        id: model.id,
        name: model.name,
        retrieved: pricing.source.retrieved,
        sourceUrl: pricing.source.url,
        ageDays: Math.floor((asOfTimestamp - retrievedTimestamp) / DAY_MS),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const stale = entries.filter((entry) => entry.ageDays > maxAgeDays);
  const futureDated = entries.filter((entry) => entry.ageDays < 0);

  return {
    asOf,
    maxAgeDays,
    pricedCount: entries.length,
    stale,
    futureDated,
    ok: stale.length === 0 && futureDated.length === 0,
  };
}

export function formatPricingAudit(audit: PricingAudit) {
  const lines = [
    "# LM Board pricing freshness audit",
    "",
    `Audit date: **${audit.asOf}**`,
    `Maximum age: **${audit.maxAgeDays} days**`,
    `Listed prices checked: **${audit.pricedCount}**`,
    `Status: **${audit.ok ? "fresh" : "attention required"}**`,
  ];

  if (audit.stale.length > 0) {
    lines.push(
      "",
      "## Stale prices",
      "",
      "| Model | Checked | Age | Source |",
      "| --- | --- | ---: | --- |",
      ...audit.stale.map(
        (entry) =>
          `| ${entry.name} (\`${entry.id}\`) | ${entry.retrieved} | ${entry.ageDays} days | [Official pricing](${entry.sourceUrl}) |`,
      ),
    );
  }

  if (audit.futureDated.length > 0) {
    lines.push(
      "",
      "## Future-dated checks",
      "",
      ...audit.futureDated.map(
        (entry) => `- ${entry.name} (\`${entry.id}\`): ${entry.retrieved}`,
      ),
    );
  }

  if (audit.ok) {
    lines.push("", "All listed prices are within the freshness window.");
  }

  return `${lines.join("\n")}\n`;
}

type CliOptions = {
  asOf: string;
  maxAgeDays: number;
  reportPath: string | null;
};

function parseArgs(args: string[]): CliOptions {
  const today = new Date().toISOString().slice(0, 10);
  const options: CliOptions = {
    asOf: today,
    maxAgeDays: DEFAULT_MAX_AGE_DAYS,
    reportPath: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    const next = args[index + 1];

    if (value === "--as-of" && next) {
      options.asOf = next;
      index += 1;
    } else if (value === "--max-age-days" && next) {
      options.maxAgeDays = Number(next);
      index += 1;
    } else if (value === "--report" && next) {
      options.reportPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${value}`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const input = JSON.parse(
    await readFile(path.join(projectRoot, "data/models.json"), "utf8"),
  ) as unknown;
  const models = ModelsFileSchema.parse(input);
  const audit = auditPricing(models, options.asOf, options.maxAgeDays);
  const report = formatPricingAudit(audit);

  if (options.reportPath) await writeFile(options.reportPath, report, "utf8");
  process.stdout.write(report);
  if (!audit.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
