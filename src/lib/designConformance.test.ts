import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BREAKPOINT_QUERY_VALUES } from "@/lib/breakpoints";
import { readTokens } from "@/lib/contrast";

const stylesDirectory = join(process.cwd(), "src/styles");
const styles = readdirSync(stylesDirectory)
  .filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(join(stylesDirectory, file), "utf8"))
  .join("\n");

describe("CSS foundation conformance", () => {
  it("uses only breakpoint literals derived from the shared constants", () => {
    const found = [...styles.matchAll(/@media\s+([^{]+)\{/g)].flatMap(
      (media) =>
        [
          ...media[1].matchAll(
            /(?:min|max)-width:\s*(\d+(?:\.\d+)?)px/g,
          ),
        ].map((match) => Number(match[1])),
    );

    expect([...new Set(found)].sort((a, b) => a - b)).toEqual(
      [...BREAKPOINT_QUERY_VALUES].sort((a, b) => a - b),
    );
  });

  it("routes every z-index through the named token ladder", () => {
    expect(styles).not.toMatch(/z-index:\s*-?\d/);
    for (const token of [
      "--z-content",
      "--z-command",
      "--z-popover",
      "--z-tooltip",
      "--z-inspector",
      "--z-toast",
      "--z-palette",
      "--z-skip-link",
    ]) {
      expect(styles).toContain(`${token}:`);
      expect(styles).toContain(`z-index: var(${token})`);
    }
  });

  it("lets each control keep its own focus-ring shape", () => {
    const base = readFileSync(join(stylesDirectory, "base.css"), "utf8");
    const focusRule = base.match(/:focus-visible\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(focusRule).toContain("outline:");
    expect(focusRule).not.toContain("border-radius");
  });

  it("removes transform motion instead of shortening it in reduced motion", () => {
    const motion = readFileSync(join(stylesDirectory, "motion.css"), "utf8");
    const reduced = motion.slice(
      motion.indexOf("@media (prefers-reduced-motion: reduce)"),
    );

    for (const duration of [
      "--dur-snap",
      "--dur-glide",
      "--dur-settle",
      "--dur-bounce",
      "--dur-ambient",
    ]) {
      expect(reduced).toMatch(new RegExp(`${duration}:\\s*0ms`));
    }
    expect(reduced).toContain("--tr-press: none");
    expect(reduced).not.toContain("--dur-instant: 0ms");
  });
});

describe("last-resort error palette", () => {
  it("matches the shipped dark-theme roles", () => {
    const tokenCss = readFileSync(join(stylesDirectory, "tokens.css"), "utf8");
    const dark = readTokens(tokenCss).dark;
    const error = readFileSync(
      join(process.cwd(), "src/app/global-error.tsx"),
      "utf8",
    );

    for (const token of [
      "--bg-base",
      "--fg-primary",
      "--fg-secondary",
      "--fg-tertiary",
      "--line-interactive",
      "--signal-500",
    ]) {
      expect(error).toContain(dark[token]);
    }
  });
});
