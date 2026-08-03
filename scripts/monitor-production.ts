import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://www.checklmboard.xyz";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const EXPECTED_CSP_DIRECTIVES = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
] as const;

type ModelCandidate = {
  id: string;
  name: string;
  releaseDate: string;
};

type RouteSpec = {
  path: string;
  contentTypes: readonly string[];
  bodyIncludes: string[];
};

type MonitorFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RouteCheck = {
  path: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  errors: string[];
};

export type ProductionMonitorReport = {
  baseUrl: string;
  checkedAt: string;
  modelId: string;
  ok: boolean;
  checks: RouteCheck[];
};

type MonitorOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  fetchImpl?: MonitorFetch;
  now?: () => Date;
  models: unknown;
};

const SECURITY_HEADERS = [
  {
    name: "x-content-type-options",
    expected: "nosniff",
    valid: (value: string) => value.trim().toLowerCase() === "nosniff",
  },
  {
    name: "x-frame-options",
    expected: "DENY",
    valid: (value: string) => value.trim().toLowerCase() === "deny",
  },
  {
    name: "referrer-policy",
    expected: "strict-origin-when-cross-origin",
    valid: (value: string) =>
      value.trim().toLowerCase() === "strict-origin-when-cross-origin",
  },
  {
    name: "content-security-policy",
    expected: EXPECTED_CSP_DIRECTIVES.join("; "),
    valid: (value: string) => {
      const directives = new Set(
        value
          .toLowerCase()
          .split(";")
          .map((directive) => directive.trim().replace(/\s+/g, " "))
          .filter(Boolean),
      );
      return EXPECTED_CSP_DIRECTIVES.every((directive) =>
        directives.has(directive),
      );
    },
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Pick the oldest valid model deterministically. New models are added to the
 * front of models.json, so this avoids making the monitor depend on a route
 * that may still be propagating through a production deployment.
 */
export function selectStableModel(models: unknown): ModelCandidate {
  if (!Array.isArray(models)) {
    throw new Error("data/models.json must contain an array");
  }

  const candidates = models
    .filter(isRecord)
    .map((model) => ({
      id: model.id,
      name: model.name,
      releaseDate: model.releaseDate,
    }))
    .filter(
      (model): model is ModelCandidate =>
        typeof model.id === "string" &&
        /^[a-z0-9][a-z0-9-]*$/.test(model.id) &&
        typeof model.name === "string" &&
        model.name.trim().length > 0 &&
        typeof model.releaseDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(model.releaseDate),
    )
    .sort(
      (left, right) =>
        left.releaseDate.localeCompare(right.releaseDate) ||
        left.id.localeCompare(right.id),
    );

  const selected = candidates[0];
  if (!selected) {
    throw new Error("data/models.json has no monitorable model");
  }

  return selected;
}

function routeSpecs(model: ModelCandidate): RouteSpec[] {
  return [
    {
      path: "/",
      contentTypes: ["text/html"],
      bodyIncludes: ["LM Board", "leaderboard"],
    },
    {
      path: "/compare",
      contentTypes: ["text/html"],
      bodyIncludes: ["Compare AI models", "Choose models"],
    },
    {
      path: "/choose",
      contentTypes: ["text/html"],
      bodyIncludes: [
        "Find a model for the work",
        "Update shortlist",
        "Compare shortlist",
      ],
    },
    {
      path: `/model/${model.id}`,
      contentTypes: ["text/html"],
      bodyIncludes: [model.name, "Scores and sources"],
    },
  ];
}

function validateBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`Monitor base URL must use HTTPS: ${value}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`Monitor base URL must not contain credentials or a query`);
  }
  url.pathname = "/";
  return url;
}

async function readBoundedBody(
  response: Response,
  maxBodyBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new Error(
      `response declares ${declaredLength} bytes (limit ${maxBodyBytes})`,
    );
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      received += value.byteLength;
      if (received > maxBodyBytes) {
        await reader.cancel("response exceeded monitor body limit");
        throw new Error(
          `response exceeded ${maxBodyBytes}-byte monitor body limit`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function checkRoute(
  baseUrl: URL,
  spec: RouteSpec,
  fetchImpl: MonitorFetch,
  timeoutMs: number,
  maxBodyBytes: number,
): Promise<RouteCheck> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`request exceeded ${timeoutMs}ms timeout`));
  }, timeoutMs);

  let status: number | null = null;
  const errors: string[] = [];

  try {
    const requestUrl = new URL(spec.path, baseUrl);
    const response = await fetchImpl(requestUrl, {
      headers: {
        accept: spec.contentTypes.join(", "),
        "user-agent": "lmboard-production-monitor/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    status = response.status;

    if (response.status !== 200) {
      errors.push(`expected HTTP 200, received ${response.status}`);
    }

    if (response.url) {
      const finalUrl = new URL(response.url);
      if (finalUrl.origin !== baseUrl.origin) {
        errors.push(`redirected outside ${baseUrl.origin} to ${finalUrl.origin}`);
      }
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !spec.contentTypes.some((expected) =>
        contentType.toLowerCase().includes(expected),
      )
    ) {
      errors.push(
        `expected content-type containing one of ${spec.contentTypes.join(", ")}, received ${contentType || "(missing)"}`,
      );
    }

    for (const requirement of SECURITY_HEADERS) {
      const value = response.headers.get(requirement.name);
      if (!value) {
        errors.push(`missing ${requirement.name} header`);
      } else if (!requirement.valid(value)) {
        errors.push(
          `${requirement.name} does not satisfy expected value: ${requirement.expected}`,
        );
      }
    }

    const body = await readBoundedBody(response, maxBodyBytes);
    for (const expected of spec.bodyIncludes) {
      if (!body.includes(expected)) {
        errors.push(`response body is missing ${JSON.stringify(expected)}`);
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }

  return {
    path: spec.path,
    ok: errors.length === 0,
    status,
    durationMs: Math.round(performance.now() - startedAt),
    errors,
  };
}

export async function runProductionMonitor({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  fetchImpl = fetch,
  now = () => new Date(),
  models,
}: MonitorOptions): Promise<ProductionMonitorReport> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("timeoutMs must be an integer between 1000 and 30000");
  }
  if (
    !Number.isInteger(maxBodyBytes) ||
    maxBodyBytes < 1_024 ||
    maxBodyBytes > 10 * 1024 * 1024
  ) {
    throw new Error(
      "maxBodyBytes must be an integer between 1024 and 10485760",
    );
  }

  const normalizedBaseUrl = validateBaseUrl(baseUrl);
  const model = selectStableModel(models);
  const checks = await Promise.all(
    routeSpecs(model).map((spec) =>
      checkRoute(
        normalizedBaseUrl,
        spec,
        fetchImpl,
        timeoutMs,
        maxBodyBytes,
      ),
    ),
  );

  return {
    baseUrl: normalizedBaseUrl.origin,
    checkedAt: now().toISOString(),
    modelId: model.id,
    ok: checks.every((check) => check.ok),
    checks,
  };
}

export function formatMonitorReport(report: ProductionMonitorReport): string {
  const lines = [
    "# LM Board production monitor",
    "",
    `Status: **${report.ok ? "healthy" : "unhealthy"}**`,
    "",
    `Checked: ${report.checkedAt}`,
    `Origin: ${report.baseUrl}`,
    `Model fixture: \`${report.modelId}\``,
    "",
  ];

  for (const check of report.checks) {
    const status = check.status === null ? "no response" : `HTTP ${check.status}`;
    lines.push(
      `- ${check.ok ? "PASS" : "FAIL"} \`${check.path}\` — ${status}, ${check.durationMs}ms`,
    );
    for (const error of check.errors) {
      lines.push(`  - ${error}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

type CliOptions = {
  baseUrl: string;
  reportPath: string | null;
  timeoutMs: number;
};

function parseCliOptions(argv: string[]): CliOptions {
  let baseUrl = process.env.MONITOR_BASE_URL ?? DEFAULT_BASE_URL;
  let reportPath: string | null = null;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--base-url" && value) {
      baseUrl = value;
      index += 1;
    } else if (argument === "--report" && value) {
      reportPath = value;
      index += 1;
    } else if (argument === "--timeout-ms" && value) {
      timeoutMs = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  return { baseUrl, reportPath, timeoutMs };
}

async function runCli(): Promise<void> {
  let reportPath: string | null = null;

  try {
    const options = parseCliOptions(process.argv.slice(2));
    reportPath = options.reportPath;
    const models = JSON.parse(
      await readFile(new URL("../data/models.json", import.meta.url), "utf8"),
    ) as unknown;
    const report = await runProductionMonitor({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
      models,
    });
    const output = formatMonitorReport(report);

    process.stdout.write(output);
    if (reportPath) await writeFile(reportPath, output, "utf8");
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = `# LM Board production monitor\n\nStatus: **error**\n\n${message}\n`;
    process.stderr.write(output);
    if (reportPath) await writeFile(reportPath, output, "utf8");
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === executedPath) {
  void runCli();
}
