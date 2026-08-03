"use client";

import { useEffect, useState } from "react";

import { MoonIcon, SunIcon } from "@/components/Icon";

type Theme = "light" | "dark";

const STORAGE_KEY = "lmboard-theme";
const THEME_META_SELECTOR = "meta[data-lmboard-theme-color]";
const THEME_COLORS: Record<Theme, string> = {
  light: "#eaeef5",
  dark: "#0b0d10",
};

function applyTheme(theme: Theme, source: "explicit" | "system") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themeSource = source;
  document
    .querySelector<HTMLMetaElement>(THEME_META_SELECTOR)
    ?.setAttribute("content", THEME_COLORS[theme]);
}

function resolvedTheme(): Theme {
  const explicitTheme = document.documentElement.dataset.theme;
  if (explicitTheme === "light" || explicitTheme === "dark") {
    return explicitTheme;
  }

  // The design is dark-first, so an unset preference resolves to dark unless
  // the OS explicitly asks for light.
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let active = true;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemTheme = () => {
      if (document.documentElement.dataset.themeSource !== "explicit") {
        const nextTheme = mediaQuery.matches ? "light" : "dark";
        applyTheme(nextTheme, "system");
        setTheme(nextTheme);
      }
    };

    const currentTheme = resolvedTheme();
    const source =
      document.documentElement.dataset.themeSource === "system"
        ? "system"
        : document.documentElement.dataset.theme
          ? "explicit"
          : "system";
    applyTheme(currentTheme, source);
    queueMicrotask(() => {
      if (active) setTheme(currentTheme);
    });
    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => {
      active = false;
      mediaQuery.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  function toggleTheme() {
    const currentTheme = theme ?? resolvedTheme();
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    applyTheme(nextTheme, "explicit");
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // The theme still applies for this session when storage is unavailable.
    }
    setTheme(nextTheme);
  }

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="btn-icon theme-toggle"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
