import { describe, expect, it } from "vitest";

import {
  formatMonitorReport,
  runProductionMonitor,
  selectStableModel,
} from "./monitor-production";

const securityHeaders = {
  "content-security-policy":
    "default-src 'none'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const models = [
  {
    id: "new-model",
    name: "New Model",
    releaseDate: "2026-01-01",
  },
  {
    id: "stable-model",
    name: "Stable Model",
    releaseDate: "2025-01-01",
  },
];

function responseFor(url: URL, headers = securityHeaders): Response {
  const bodies: Record<string, { body: string; contentType: string }> = {
    "/": {
      body: "<html><title>LM Board</title><main>leaderboard</main></html>",
      contentType: "text/html; charset=utf-8",
    },
    "/compare": {
      body: "<html><h1>Compare</h1><p>Every number keeps its citation.</p></html>",
      contentType: "text/html; charset=utf-8",
    },
    "/value": {
      body: "<html><h1>Price versus performance</h1><p>efficient frontier</p></html>",
      contentType: "text/html; charset=utf-8",
    },
    "/model/stable-model": {
      body: "<html><h1>Stable Model</h1><h2>Scores and sources</h2></html>",
      contentType: "text/html; charset=utf-8",
    },
    "/feed.xml": {
      body: [
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        "<title>LM Board — model data feed</title>",
        "<entry></entry>",
        "</feed>",
      ].join(""),
      // Vercel's static file layer uses this generic XML media type.
      contentType: "application/xml; charset=utf-8",
    },
  };
  const fixture = bodies[url.pathname];

  return new Response(fixture?.body ?? "missing", {
    status: fixture ? 200 : 404,
    headers: {
      ...headers,
      "content-type": fixture?.contentType ?? "text/plain",
    },
  });
}

describe("selectStableModel", () => {
  it("selects the oldest valid model independently of file order", () => {
    expect(selectStableModel(models)).toEqual(models[1]);
  });

  it("rejects data without a safe route id", () => {
    expect(() =>
      selectStableModel([
        {
          id: "../escape",
          name: "Unsafe",
          releaseDate: "2025-01-01",
        },
      ]),
    ).toThrow("no monitorable model");
  });
});

describe("runProductionMonitor", () => {
  it("checks all production surfaces, expected content, and security headers", async () => {
    const requestedPaths: string[] = [];
    const report = await runProductionMonitor({
      baseUrl: "https://example.test",
      models,
      now: () => new Date("2026-07-26T00:00:00.000Z"),
      fetchImpl: async (input) => {
        const url = new URL(input);
        requestedPaths.push(url.pathname);
        return responseFor(url);
      },
    });

    expect(requestedPaths).toEqual([
      "/",
      "/compare",
      "/value",
      "/model/stable-model",
      "/feed.xml",
    ]);
    expect(report).toMatchObject({
      baseUrl: "https://example.test",
      checkedAt: "2026-07-26T00:00:00.000Z",
      modelId: "stable-model",
      ok: true,
    });
    expect(report.checks).toHaveLength(5);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it("reports missing content, headers, and oversized responses", async () => {
    const report = await runProductionMonitor({
      baseUrl: "https://example.test",
      models,
      maxBodyBytes: 1_024,
      fetchImpl: async (input) => {
        const url = new URL(input);
        if (url.pathname === "/compare") {
          return new Response("x".repeat(1_025), {
            headers: {
              ...securityHeaders,
              "content-length": "1025",
              "content-type": "text/html",
            },
          });
        }
        return responseFor(url, {
          ...securityHeaders,
          "content-security-policy": "default-src 'none'",
        });
      },
    });

    expect(report.ok).toBe(false);
    expect(
      report.checks
        .flatMap((check) => check.errors)
        .some((error) => error.includes("content-security-policy")),
    ).toBe(true);
    expect(
      report.checks
        .find((check) => check.path === "/compare")
        ?.errors.join(" "),
    ).toContain("declares 1025 bytes");
    expect(formatMonitorReport(report)).toContain("Status: **unhealthy**");
  });
});
