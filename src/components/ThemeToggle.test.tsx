import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/ThemeToggle";

const originalMatchMedia = window.matchMedia;

function installThemeMeta() {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.dataset.lmboardThemeColor = "";
  meta.content = "#0b0d10";
  document.head.append(meta);
  return meta;
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeSource;
});

afterEach(() => {
  document.querySelector("meta[data-lmboard-theme-color]")?.remove();
  window.matchMedia = originalMatchMedia;
});

describe("ThemeToggle", () => {
  it("keeps the explicit page theme, browser chrome and saved preference aligned", async () => {
    const user = userEvent.setup();
    const meta = installThemeMeta();
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themeSource = "explicit";
    render(<ThemeToggle />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Switch to light theme" }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: "Switch to light theme" }),
    );

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeSource).toBe("explicit");
    expect(meta.content).toBe("#eaeef5");
    expect(window.localStorage.getItem("lmboard-theme")).toBe("light");
  });

  it("aligns browser chrome with the resolved system fallback on mount", async () => {
    const meta = installThemeMeta();
    render(<ThemeToggle />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    expect(document.documentElement.dataset.themeSource).toBe("system");
    expect(meta.content).toBe("#0b0d10");
  });

  it("continues following OS changes until the user chooses explicitly", async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaQuery = {
      matches: false,
      media: "(prefers-color-scheme: light)",
      onchange: null,
      addEventListener: (
        _type: "change",
        callback: (event: MediaQueryListEvent) => void,
      ) => {
        listener = callback;
      },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
    window.matchMedia = () => mediaQuery;
    const meta = installThemeMeta();
    render(<ThemeToggle />);

    await waitFor(() => {
      expect(document.documentElement.dataset.themeSource).toBe("system");
    });
    Object.defineProperty(mediaQuery, "matches", { value: true });
    act(() => {
      listener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(meta.content).toBe("#eaeef5");
  });
});
