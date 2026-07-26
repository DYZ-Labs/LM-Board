import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrast, readTokens, type Theme } from "@/lib/contrast";

// Parsed from the shipped stylesheet, so an edit to a token is checked here
// rather than silently regressing contrast in production.
const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
const tokens = readTokens(css);
const THEMES: Theme[] = ["light", "dark"];

const AA_TEXT = 4.5;
const AA_LARGE = 3;
const AA_NON_TEXT = 3;

describe("token parsing", () => {
  it("finds both themes for every dual-valued token", () => {
    expect(Object.keys(tokens.light).length).toBeGreaterThan(20);
    expect(Object.keys(tokens.light).sort()).toEqual(
      Object.keys(tokens.dark).sort(),
    );
  });
});

describe.each(THEMES)("%s theme — text contrast (AA 4.5:1)", (theme) => {
  const t = tokens[theme];
  const surfaces = ["--bg-base", "--bg-raised", "--bg-overlay"] as const;
  const inks = ["--fg-primary", "--fg-secondary", "--fg-tertiary"] as const;

  for (const ink of inks) {
    for (const surface of surfaces) {
      it(`${ink} on ${surface}`, () => {
        const ratio = contrast(t[ink], t[surface]);
        expect(
          ratio,
          `${ink} on ${surface} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  for (const role of ["--signal-500", "--warn", "--pos"] as const) {
    it(`${role} on --bg-raised`, () => {
      const ratio = contrast(t[role], t["--bg-raised"]);
      expect(
        ratio,
        `${role} on --bg-raised = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});

describe.each(THEMES)("%s theme — hover and active rows", (theme) => {
  const t = tokens[theme];

  // Rows tint on hover and stay tinted while expanded, so the ink has to hold
  // its ratio against those surfaces too, not just the resting one.
  for (const surface of ["--bg-hover", "--bg-active"] as const) {
    it(`--fg-primary and --fg-secondary on ${surface}`, () => {
      expect(contrast(t["--fg-primary"], t[surface])).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrast(t["--fg-secondary"], t[surface])).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });
  }

  // --fg-tertiary is documented as conditional: it clears AA on the resting
  // surfaces but only large-text AA on the tinted ones, so it is never used
  // for small text inside a hovered row.
  it("--fg-tertiary clears large-text AA on tinted rows", () => {
    for (const surface of ["--bg-hover", "--bg-active"] as const) {
      expect(contrast(t["--fg-tertiary"], t[surface])).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    }
  });
});

describe.each(THEMES)("%s theme — non-text contrast (1.4.11, 3:1)", (theme) => {
  const t = tokens[theme];

  it("--line-interactive identifies controls on every surface", () => {
    for (const surface of ["--bg-base", "--bg-raised", "--bg-overlay"] as const) {
      const ratio = contrast(t["--line-interactive"], t[surface]);
      expect(
        ratio,
        `--line-interactive on ${surface} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it("the focus ring is visible on every surface it can land on", () => {
    for (const surface of [
      "--bg-base",
      "--bg-raised",
      "--bg-overlay",
      "--bg-hover",
      "--bg-active",
    ] as const) {
      const ratio = contrast(t["--signal-500"], t[surface]);
      expect(
        ratio,
        `focus ring on ${surface} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe.each(THEMES)("%s theme — magnitude ramp", (theme) => {
  const t = tokens[theme];
  const steps = ["--score-1", "--score-2", "--score-3", "--score-4", "--score-5"];

  it("rises monotonically so the ramp reads as a light level", () => {
    const ratios = steps.map((step) => contrast(t[step], t["--bg-raised"]));

    for (let i = 1; i < ratios.length; i += 1) {
      expect(
        ratios[i],
        `${steps[i]} (${ratios[i].toFixed(2)}) must exceed ${steps[i - 1]} (${ratios[i - 1].toFixed(2)})`,
      ).toBeGreaterThan(ratios[i - 1]);
    }
  });

  it("is a single hue, so it stays legible under colour-vision deficiency", () => {
    // Every step is the signal hue composited at a different alpha; the
    // encoding is luminance, never hue. Guard that no step drifts off-hue.
    const hueOf = (hex: string) => {
      const [r, g, b] = [0, 2, 4].map((offset) =>
        parseInt(hex.replace("#", "").slice(offset, offset + 2), 16),
      );
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      let h: number;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      return ((h * 60) + 360) % 360;
    };

    const hues = steps.map((step) => hueOf(t[step]));
    const spread = Math.max(...hues) - Math.min(...hues);
    expect(spread, `ramp hue spread ${spread.toFixed(1)}°`).toBeLessThan(25);
  });
});
