"use client";

import { useEffect, useState } from "react";

import { MoonIcon, SunIcon } from "@/components/Icon";

type Theme = "light" | "dark";

const STORAGE_KEY = "lmboard-theme";

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
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemTheme = () => {
      if (!document.documentElement.dataset.theme) {
        setTheme(mediaQuery.matches ? "light" : "dark");
      }
    };

    setTheme(resolvedTheme());
    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, []);

  function toggleTheme() {
    const currentTheme = theme ?? resolvedTheme();
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
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
