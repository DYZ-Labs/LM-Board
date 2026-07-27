/**
 * WCAG 2.x relative-luminance contrast, plus a reader for the shipped design
 * tokens.
 *
 * The tokens are parsed out of src/styles/tokens.css rather than duplicated
 * here: a copy would drift, and a contrast test that passes against a stale
 * copy of the palette is worse than no test at all.
 */

export type Theme = "light" | "dark";
type Rgba = { r: number; g: number; b: number; a: number };

function channel(value: number) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseColor(value: string): Rgba {
  const input = value.trim().toLowerCase();
  if (input.startsWith("#")) {
    const shorthand = input.slice(1);
    const full =
      shorthand.length === 3 || shorthand.length === 4
        ? shorthand
            .split("")
            .map((character) => character + character)
            .join("")
        : shorthand;
    if (full.length !== 6 && full.length !== 8) {
      throw new Error(`Unsupported colour: ${value}`);
    }
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    };
  }

  const functional = input.match(/^rgba?\((.+)\)$/);
  if (!functional) throw new Error(`Unsupported colour: ${value}`);
  const parts = functional[1].split(",").map((part) => part.trim());
  if (parts.length < 3 || parts.length > 4) {
    throw new Error(`Unsupported colour: ${value}`);
  }
  const component = (part: string) =>
    part.endsWith("%")
      ? (Number.parseFloat(part) / 100) * 255
      : Number.parseFloat(part);
  const alpha = parts[3]
    ? parts[3].endsWith("%")
      ? Number.parseFloat(parts[3]) / 100
      : Number.parseFloat(parts[3])
    : 1;

  return {
    r: component(parts[0]),
    g: component(parts[1]),
    b: component(parts[2]),
    a: alpha,
  };
}

function opaqueHex({ r, g, b }: Rgba) {
  return `#${[r, g, b]
    .map((component) =>
      Math.round(component).toString(16).padStart(2, "0"),
    )
    .join("")}`;
}

export function luminance(color: string): number {
  const { r, g, b, a } = parseColor(color);
  if (a !== 1) {
    throw new Error("Translucent colours need an opaque background");
  }

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function composite(foreground: string, background: string): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (bg.a !== 1) throw new Error("Composite background must be opaque");

  return opaqueHex({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
}

export function contrast(
  foreground: string,
  background: string,
  underlay?: string,
): number {
  const backgroundAlpha = parseColor(background).a;
  if (backgroundAlpha !== 1 && !underlay) {
    throw new Error("Translucent backgrounds need an opaque underlay");
  }
  const resolvedBackground =
    backgroundAlpha === 1 ? background : composite(background, underlay!);
  const resolvedForeground =
    parseColor(foreground).a === 1
      ? foreground
      : composite(foreground, resolvedBackground);
  const a = luminance(resolvedForeground);
  const b = luminance(resolvedBackground);
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

  const color = String.raw`(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))`;
  const pattern = new RegExp(
    String.raw`(--[a-z0-9-]+):\s*light-dark\(\s*(${color})\s*,\s*(${color})\s*\)`,
    "g",
  );

  for (const match of css.matchAll(pattern)) {
    const [, name, light, dark] = match;
    themes.light[name] = light.toLowerCase().replace(/\s+/g, " ");
    themes.dark[name] = dark.toLowerCase().replace(/\s+/g, " ");
  }

  return themes;
}
