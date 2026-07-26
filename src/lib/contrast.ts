/**
 * WCAG 2.x relative-luminance contrast, plus a reader for the shipped design
 * tokens.
 *
 * The tokens are parsed out of src/styles/tokens.css rather than duplicated
 * here: a copy would drift, and a contrast test that passes against a stale
 * copy of the palette is worse than no test at all.
 */

export type Theme = "light" | "dark";

function channel(value: number) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Composites a translucent colour over an opaque one, for ramp steps. */
export function flatten(
  foreground: string,
  background: string,
  alpha: number,
): string {
  const parse = (hex: string) => {
    const value = hex.replace("#", "");
    return [0, 2, 4].map((offset) =>
      parseInt(value.slice(offset, offset + 2), 16),
    );
  };
  const fg = parse(foreground);
  const bg = parse(background);

  return `#${fg
    .map((component, index) =>
      Math.round(component * alpha + bg[index] * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Reads `--name: light-dark(#light, #dark)` declarations from a stylesheet.
 * Static single-value fallbacks declared earlier in the file are overwritten by
 * the light-dark() pair, which mirrors how the cascade resolves them.
 */
export function readTokens(css: string): Record<Theme, Record<string, string>> {
  const themes: Record<Theme, Record<string, string>> = {
    light: {},
    dark: {},
  };

  const pattern =
    /(--[a-z0-9-]+):\s*light-dark\(\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;

  for (const match of css.matchAll(pattern)) {
    const [, name, light, dark] = match;
    themes.light[name] = light.toLowerCase();
    themes.dark[name] = dark.toLowerCase();
  }

  return themes;
}
