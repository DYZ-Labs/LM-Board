"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "lmboard-theme";

function resolvedTheme(): Theme {
  const explicitTheme = document.documentElement.dataset.theme;
  if (explicitTheme === "light" || explicitTheme === "dark") {
    return explicitTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (!document.documentElement.dataset.theme) {
        setTheme(mediaQuery.matches ? "dark" : "light");
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
      className="theme-toggle"
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
          <circle cx="10" cy="10" r="3.25" fill="none" />
          <path d="M10 1.75v2M10 16.25v2M1.75 10h2M16.25 10h2M4.15 4.15l1.4 1.4M14.45 14.45l1.4 1.4M15.85 4.15l-1.4 1.4M5.55 14.45l-1.4 1.4" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
          <path d="M15.9 13.3A7 7 0 0 1 6.7 4.1a6.7 6.7 0 1 0 9.2 9.2Z" fill="none" />
        </svg>
      )}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
