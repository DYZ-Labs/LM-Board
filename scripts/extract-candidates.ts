import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { mapPrintedBenchmark } from "../src/lib/benchmarkMapping";
import {
  getSourceUrlPinningWarning,
  matchesSourceHost,
} from "../src/lib/dataIntegrity";
import {
  CandidateFileSchema,
  ModelsFileSchema,
  PublishersFileSchema,
  type Candidate,
  type CandidateFile,
  type Model,
  type Publisher,
} from "../src/lib/schema";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CANDIDATE_DIRECTORY = path.join(projectRoot, "data/candidates");
const SOURCE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type TableRow = {
  cells: string[];
  quote: string;
};

type ParsedTable = {
  headers: string[];
  rows: TableRow[];
};

export type SkippedCandidate = {
  outcome:
    | "reject"
    | "ambiguous"
    | "unresolved-model"
    | "unparseable-value";
  reason: string;
  evidence: Candidate["evidence"];
  rawValue: string | null;
};

export type SkippedCandidateFile = {
  source: CandidateFile["source"];
  note?: string;
  skipped: SkippedCandidate[];
};

export type ExtractionResult = {
  candidateFile: CandidateFile;
  skippedFile: SkippedCandidateFile;
  tableCount: number;
};

type ExtractInput = {
  text: string;
  sourceUrl: string;
  retrieved: string;
  publisherId: string;
  models: readonly Model[];
  modelMap?: Readonly<Record<string, string>>;
};

type SourceLoadOptions = {
  url: string;
  fromFile: string | null;
  retrieved: string | null;
};

type SourceLoadDependencies = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

type CliOptions = {
  url: string;
  sourceSlug: string;
  publisherId: string;
  fromFile: string | null;
  retrieved: string | null;
  modelMapPath: string | null;
  overwrite: boolean;
};

export function assertPublisherSourceAllowed(
  sourceUrl: string,
  publisher: Publisher,
): void {
  if (
    publisher.sourceHosts.some((allowEntry) =>
      matchesSourceHost(sourceUrl, allowEntry),
    )
  ) {
    return;
  }

  const sourceHost = new URL(sourceUrl).hostname;
  const allowedEntries = publisher.sourceHosts
    .map((entry) => `"${entry}"`)
    .join(", ");

  throw new Error(
    `Publisher "${publisher.id}" rejected source host "${sourceHost}"; allowed sourceHosts: ${allowedEntries}`,
  );
}

export function warnIfSourceUrlMayBeUnpinned(
  sourceUrl: string,
  warn: (message: string) => void = console.warn,
): void {
  const warning = getSourceUrlPinningWarning(sourceUrl);
  if (warning !== null) warn(`Warning: ${warning}`);
}

function searchable(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        const point = Number.parseInt(code.slice(2), 16);
        return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
      }
      if (code.startsWith("#")) {
        const point = Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
      }
      return named[code.toLowerCase()] ?? entity;
    },
  );
}

function displayedHtml(cell: string): string {
  return decodeHtmlEntities(
    cell
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .trim()
    .replace(/\s+/g, " ");
}

function displayedMarkdown(cell: string): string {
  return decodeHtmlEntities(
    cell
      .replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/[*_`~]/g, ""),
  )
    .trim()
    .replace(/\s+/g, " ");
}

function splitMarkdownRow(line: string): string[] {
  const source = line.replace(/\r$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      current += character;
      escaped = true;
    } else if (character === "|") {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);

  if (source.trimStart().startsWith("|")) cells.shift();
  if (source.trimEnd().endsWith("|")) cells.pop();

  return cells.map((cell) => displayedMarkdown(cell.replace(/\\\|/g, "|")));
}

function isMarkdownSeparator(cells: readonly string[]): boolean {
  return (
    cells.length >= 2 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")))
  );
}

function parseMarkdownTables(text: string): ParsedTable[] {
  const lines = text.split("\n");
  const tables: ParsedTable[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = splitMarkdownRow(lines[index] ?? "");
    const separator = splitMarkdownRow(lines[index + 1] ?? "");

    if (
      header.length < 2 ||
      header.length !== separator.length ||
      !isMarkdownSeparator(separator)
    ) {
      continue;
    }

    const rows: TableRow[] = [];
    let rowIndex = index + 2;

    while (rowIndex < lines.length) {
      const line = (lines[rowIndex] ?? "").replace(/\r$/, "");
      if (!line.includes("|")) break;
      const cells = splitMarkdownRow(line);
      if (cells.length !== header.length) break;
      rows.push({ cells, quote: line });
      rowIndex += 1;
    }

    tables.push({ headers: header, rows });
    index = rowIndex - 1;
  }

  return tables;
}

function parseHtmlTables(text: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const tableMatches = text.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi);

  for (const tableMatch of tableMatches) {
    const table = tableMatch[0];
    const parsedRows: Array<TableRow & { hasHeaderCells: boolean }> = [];
    const rowSpans = new Map<
      number,
      { text: string; rowsLeft: number; quoteStart: number }
    >();

    for (const rowMatch of table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi)) {
      const row = rowMatch[0];
      const rawCells = [
        ...row.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi),
      ];
      if (rawCells.length === 0 || rowMatch.index === undefined) continue;

      const cells: string[] = [];
      const inheritedColumns = new Set(rowSpans.keys());
      const quoteStarts = [rowMatch.index];

      for (const [column, span] of rowSpans) {
        cells[column] = span.text;
        quoteStarts.push(span.quoteStart);
      }

      let column = 0;
      for (const cell of rawCells) {
        while (cells[column] !== undefined) column += 1;
        const attributes = cell[2] ?? "";
        const rowSpan = parseHtmlSpan(attributes, "rowspan");
        const columnSpan = parseHtmlSpan(attributes, "colspan");
        const cellText = displayedHtml(cell[3] ?? "");

        for (let offset = 0; offset < columnSpan; offset += 1) {
          const targetColumn = column + offset;
          cells[targetColumn] = cellText;
          if (rowSpan > 1) {
            rowSpans.set(targetColumn, {
              text: cellText,
              rowsLeft: rowSpan - 1,
              quoteStart: rowMatch.index,
            });
          }
        }
        column += columnSpan;
      }

      for (const columnIndex of inheritedColumns) {
        const span = rowSpans.get(columnIndex);
        if (span === undefined) continue;
        span.rowsLeft -= 1;
        if (span.rowsLeft === 0) rowSpans.delete(columnIndex);
      }

      const quoteStart = Math.min(...quoteStarts);
      const quoteEnd = rowMatch.index + row.length;
      parsedRows.push({
        cells,
        quote: table.slice(quoteStart, quoteEnd),
        hasHeaderCells: rawCells.every(
          (cell) => (cell[1] ?? "").toLowerCase() === "th",
        ),
      });
    }

    const headerIndex = parsedRows.findIndex(({ hasHeaderCells }) =>
      Boolean(hasHeaderCells),
    );
    if (headerIndex === -1) continue;

    const header = parsedRows[headerIndex];
    const rows = parsedRows
      .slice(headerIndex + 1)
      .filter(({ cells }) => cells.length === header.cells.length)
      .map(({ cells, quote }) => ({ cells, quote }));

    tables.push({ headers: header.cells, rows });
  }

  return tables;
}

function parseHtmlSpan(attributes: string, name: "colspan" | "rowspan"): number {
  const expression = new RegExp(
    `\\b${name}\\s*=\\s*(?:"(\\d+)"|'(\\d+)'|(\\d+))`,
    "i",
  );
  const match = attributes.match(expression);
  const value = Number(match?.[1] ?? match?.[2] ?? match?.[3] ?? "1");
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function parseTables(text: string): ParsedTable[] {
  const htmlTables = parseHtmlTables(text);
  return htmlTables.length > 0 ? htmlTables : parseMarkdownTables(text);
}

function parseScalarValue(value: string): number | null {
  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*%?$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function findHeaderIndex(
  headers: readonly string[],
  expressions: readonly RegExp[],
): number {
  return headers.findIndex((header) => {
    const normalized = searchable(header);
    return expressions.some((expression) => expression.test(normalized));
  });
}

function resolveModelId(
  printedHeader: string,
  models: readonly Model[],
  modelMap: Readonly<Record<string, string>>,
): string | null {
  const explicit = modelMap[printedHeader];
  if (explicit !== undefined) return explicit;

  const normalizedHeader = searchable(printedHeader);
  const matches = models
    .flatMap((model) => [model.name, model.id].map((alias) => ({ model, alias })))
    .map(({ model, alias }) => ({ model, alias: searchable(alias) }))
    .filter(
      ({ alias }) =>
        normalizedHeader === alias || normalizedHeader.startsWith(`${alias} `),
    )
    .sort(
      (left, right) =>
        right.alias.length - left.alias.length ||
        left.model.id.localeCompare(right.model.id),
    );

  const longest = matches[0];
  if (longest === undefined) return null;

  const equallySpecificIds = new Set(
    matches
      .filter(({ alias }) => alias.length === longest.alias.length)
      .map(({ model }) => model.id),
  );

  return equallySpecificIds.size === 1 ? longest.model.id : null;
}

function skippedEvidence(
  row: TableRow,
  printedBenchmarkName: string,
  printedConditions: string | null,
  printedColumnHeader: string | null,
): Candidate["evidence"] {
  return {
    quote: row.quote,
    printedBenchmarkName,
    printedConditions,
    printedColumnHeader,
  };
}

export function extractCandidatesFromText(input: ExtractInput): ExtractionResult {
  const tables = parseTables(input.text);
  const source = { url: input.sourceUrl, retrieved: input.retrieved };
  const candidates: Candidate[] = [];
  const skipped: SkippedCandidate[] = [];
  const modelMap = input.modelMap ?? {};
  const modelIds = new Set(input.models.map(({ id }) => id));

  for (const [printedHeader, modelId] of Object.entries(modelMap)) {
    if (!modelIds.has(modelId)) {
      throw new Error(
        `Model map header "${printedHeader}" uses unknown modelId "${modelId}"`,
      );
    }
  }

  for (const table of tables) {
    const benchmarkIndex = findHeaderIndex(table.headers, [
      /^benchmark$/,
      /^evaluation$/,
      /^eval$/,
    ]);
    const resolvedBenchmarkIndex = benchmarkIndex === -1 ? 0 : benchmarkIndex;
    const conditionIndex = findHeaderIndex(table.headers, [
      /^conditions?$/,
      /^settings?$/,
      /^configuration$/,
      /^variant$/,
      /^subset$/,
      /^level$/,
      /^notes?$/,
    ]);
    const metadataIndexes = new Set(
      [resolvedBenchmarkIndex, conditionIndex].filter((index) => index >= 0),
    );

    for (const [index, header] of table.headers.entries()) {
      if (/^(?:metric|unit|notes?|source)$/.test(searchable(header))) {
        metadataIndexes.add(index);
      }
    }

    for (const row of table.rows) {
      const printedBenchmarkName = row.cells[resolvedBenchmarkIndex] ?? "";
      if (printedBenchmarkName === "") continue;
      const condition = conditionIndex === -1 ? null : row.cells[conditionIndex];
      const printedConditions = condition === "" ? null : condition;
      const mapping = mapPrintedBenchmark(
        printedBenchmarkName,
        printedConditions,
      );

      if (mapping.kind !== "accept") {
        skipped.push({
          outcome: mapping.kind,
          reason:
            mapping.kind === "reject" ? mapping.reason : mapping.question,
          evidence: skippedEvidence(
            row,
            printedBenchmarkName,
            printedConditions,
            null,
          ),
          rawValue: null,
        });
        continue;
      }

      for (const [columnIndex, rawValue] of row.cells.entries()) {
        if (metadataIndexes.has(columnIndex)) continue;
        const printedColumnHeader = table.headers[columnIndex] ?? "";
        const evidence = skippedEvidence(
          row,
          printedBenchmarkName,
          printedConditions,
          printedColumnHeader === "" ? null : printedColumnHeader,
        );
        const modelId = resolveModelId(
          printedColumnHeader,
          input.models,
          modelMap,
        );

        if (modelId === null) {
          skipped.push({
            outcome: "unresolved-model",
            reason: `Column header "${printedColumnHeader}" does not resolve uniquely to a curated model`,
            evidence,
            rawValue,
          });
          continue;
        }

        const value = parseScalarValue(rawValue);
        if (value === null) {
          skipped.push({
            outcome: "unparseable-value",
            reason: `Cell "${rawValue}" is not a single printed numeric value`,
            evidence,
            rawValue,
          });
          continue;
        }

        candidates.push({
          modelId,
          benchmarkId: mapping.benchmarkId,
          publisherId: input.publisherId,
          value,
          source,
          evidence,
          extractedBy: "agent",
          review: "pending",
        });
      }
    }
  }

  const noTableNote =
    tables.length === 0
      ? "No parseable comparison table was found; no values were inferred."
      : undefined;
  const candidateFile: CandidateFile = {
    source,
    ...(noTableNote === undefined ? {} : { note: noTableNote }),
    candidates,
  };
  const skippedFile: SkippedCandidateFile = {
    source,
    ...(noTableNote === undefined ? {} : { note: noTableNote }),
    skipped,
  };
  const validation = CandidateFileSchema.safeParse(candidateFile);

  if (!validation.success) {
    throw new Error(`Extractor produced invalid candidates: ${validation.error.message}`);
  }

  return { candidateFile, skippedFile, tableCount: tables.length };
}

export async function loadExtractionSource(
  options: SourceLoadOptions,
  dependencies: SourceLoadDependencies = {},
): Promise<{ text: string; retrieved: string }> {
  if (options.fromFile !== null) {
    if (options.retrieved === null) {
      throw new Error(
        "--retrieved YYYY-MM-DD is required with --from-file because a saved file does not reveal when its page was fetched",
      );
    }

    return {
      text: await readFile(path.resolve(options.fromFile), "utf8"),
      retrieved: options.retrieved,
    };
  }

  if (options.retrieved !== null) {
    throw new Error(
      "--retrieved is only valid with --from-file; network retrieval dates are recorded automatically",
    );
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const response = await fetchImpl(options.url, {
    headers: {
      Accept: "text/html, text/markdown;q=0.9, text/plain;q=0.8",
      "User-Agent": "LM-Board-candidate-extractor/1.0",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${options.url}: HTTP ${response.status}`);
  }

  const text = await response.text();
  const retrieved = (dependencies.now ?? (() => new Date()))()
    .toISOString()
    .slice(0, 10);

  return { text, retrieved };
}

function parseArgs(args: readonly string[]): CliOptions {
  const options: Partial<CliOptions> = {
    fromFile: null,
    retrieved: null,
    modelMapPath: null,
    overwrite: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];

    if (argument === "--overwrite") {
      options.overwrite = true;
    } else if (
      [
        "--url",
        "--source",
        "--publisher",
        "--from-file",
        "--retrieved",
        "--model-map",
      ].includes(argument ?? "") &&
      next !== undefined
    ) {
      if (argument === "--url") options.url = next;
      if (argument === "--source") options.sourceSlug = next;
      if (argument === "--publisher") options.publisherId = next;
      if (argument === "--from-file") options.fromFile = next;
      if (argument === "--retrieved") options.retrieved = next;
      if (argument === "--model-map") options.modelMapPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!options.url || !URL.canParse(options.url)) {
    throw new Error("--url must be the fetched page's absolute HTTP(S) URL");
  }
  const protocol = new URL(options.url).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("--url must use HTTP(S)");
  }
  if (!options.sourceSlug || !SOURCE_SLUG.test(options.sourceSlug)) {
    throw new Error("--source must be a lowercase kebab-case source slug");
  }
  if (!options.publisherId || !SOURCE_SLUG.test(options.publisherId)) {
    throw new Error("--publisher must be a lowercase kebab-case publisher id");
  }

  return options as CliOptions;
}

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"));
}

async function loadModelMap(
  modelMapPath: string | null,
): Promise<Record<string, string>> {
  if (modelMapPath === null) return {};
  const input = JSON.parse(await readFile(path.resolve(modelMapPath), "utf8")) as unknown;

  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.entries(input).some(
      ([header, modelId]) => header.trim() === "" || typeof modelId !== "string",
    )
  ) {
    throw new Error("--model-map must be a JSON object of printed headers to model ids");
  }

  return input as Record<string, string>;
}

async function assertWritableOutput(filePath: string, overwrite: boolean) {
  if (overwrite) return;

  try {
    await access(filePath);
  } catch {
    return;
  }

  throw new Error(
    `${path.relative(projectRoot, filePath)} already exists; use --overwrite only after preserving any review decisions`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  warnIfSourceUrlMayBeUnpinned(options.url);
  const [modelsInput, publishersInput, modelMap, loaded] = await Promise.all([
    readJson("data/models.json"),
    readJson("data/publishers.json"),
    loadModelMap(options.modelMapPath),
    loadExtractionSource({
      url: options.url,
      fromFile: options.fromFile,
      retrieved: options.retrieved,
    }),
  ]);
  const models = ModelsFileSchema.parse(modelsInput);
  const publishers = PublishersFileSchema.parse(publishersInput);

  const publisher = publishers.find(({ id }) => id === options.publisherId);
  if (publisher === undefined) {
    throw new Error(`Unknown publisher id: ${options.publisherId}`);
  }
  assertPublisherSourceAllowed(options.url, publisher);

  const result = extractCandidatesFromText({
    text: loaded.text,
    sourceUrl: options.url,
    retrieved: loaded.retrieved,
    publisherId: options.publisherId,
    models,
    modelMap,
  });
  const candidatePath = path.join(
    CANDIDATE_DIRECTORY,
    `${options.sourceSlug}.json`,
  );
  const skippedPath = path.join(
    CANDIDATE_DIRECTORY,
    `${options.sourceSlug}.skipped.json`,
  );

  await Promise.all([
    assertWritableOutput(candidatePath, options.overwrite),
    assertWritableOutput(skippedPath, options.overwrite),
  ]);
  await mkdir(CANDIDATE_DIRECTORY, { recursive: true });
  await Promise.all([
    writeFile(candidatePath, `${JSON.stringify(result.candidateFile, null, 2)}\n`),
    writeFile(skippedPath, `${JSON.stringify(result.skippedFile, null, 2)}\n`),
  ]);

  console.log(
    `Extracted ${result.candidateFile.candidates.length} candidate cell(s) from ${result.tableCount} table(s); wrote ${result.skippedFile.skipped.length} skipped outcome(s).`,
  );
  console.log(path.relative(projectRoot, candidatePath));
  console.log(path.relative(projectRoot, skippedPath));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
