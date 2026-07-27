/**
 * The card's palette. `scripts/og/` is a build-time module and cannot read CSS
 * custom properties, so these are copies — and a copy of a token is a token
 * that can silently desynchronise. `og.test.ts` parses the real
 * `src/styles/tokens.css` and asserts every value below still matches its
 * dark-theme source.
 *
 * The card is dark only. There is no light variant: the product is dark-first,
 * a dark card reads in a light Slack, and two artefacts per URL doubles the
 * surface on which a wrong number can happen.
 */
export const CARD_COLOURS = {
  bgBase: "#0b0d10",
  bgRaised: "#14181d",
  fgPrimary: "#e8ecf2",
  fgSecondary: "#a7b1bf",
  fgTertiary: "#828d9a",
  fgDisabled: "#4a525d",
  lineSubtle: "#2b323c",
  lineInteractive: "#68727f",
  signal300: "#8cc7ff",
  signal500: "#4da3ff",
} as const;

/** Token name in `tokens.css` → key above. Used by the desync test. */
export const TOKEN_SOURCES: Record<keyof typeof CARD_COLOURS, string> = {
  bgBase: "--bg-base",
  bgRaised: "--bg-raised",
  fgPrimary: "--fg-primary",
  fgSecondary: "--fg-secondary",
  fgTertiary: "--fg-tertiary",
  fgDisabled: "--fg-disabled",
  lineSubtle: "--line-subtle",
  lineInteractive: "--line-interactive",
  signal300: "--signal-300",
  signal500: "--signal-500",
};
