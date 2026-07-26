import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// There is no App Router mounted under the test renderer, so anything reading
// router context throws on mount. The components under test navigate but never
// assert on navigation, so a no-op router is enough.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
}));

// jsdom implements neither of these, and both are load-bearing in the app:
// ThemeToggle reads matchMedia on mount, and LeaderboardTable scrolls the
// expanded row into view.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom reports 1024px, which is below PROFILE_BREAKPOINT — the board would
// hydrate into the profile projection and render no benchmark columns at all.
// Tests that care about the narrow default set innerWidth themselves.
Object.defineProperty(window, "innerWidth", {
  configurable: true,
  writable: true,
  value: 1440,
});
