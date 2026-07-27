/**
 * Canonical viewport boundaries. CSS cannot consume custom properties inside
 * media queries, so designConformance.test.ts keeps every literal query in
 * lockstep with this map.
 */
export const BREAKPOINTS = {
  compact: 560,
  mobile: 640,
  plotMobile: 720,
  contentWide: 760,
  documentCompact: 900,
  layoutWide: 1000,
  tablet: 1024,
  plotWide: 1200,
  tableFluid: 1440,
} as const;

export const BREAKPOINT_QUERY_VALUES = [
  BREAKPOINTS.compact,
  BREAKPOINTS.mobile,
  BREAKPOINTS.mobile + 1,
  BREAKPOINTS.plotMobile,
  BREAKPOINTS.contentWide,
  BREAKPOINTS.documentCompact,
  BREAKPOINTS.layoutWide,
  BREAKPOINTS.tablet - 1,
  BREAKPOINTS.plotWide - 1,
  BREAKPOINTS.plotWide,
  BREAKPOINTS.tableFluid - 0.02,
  BREAKPOINTS.tableFluid,
] as const;
