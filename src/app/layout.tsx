import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono } from "next/font/google";

import { siteUrl } from "@/lib/site";

import "./globals.css";

// Two variable faces, latin only. Archivo's width axis is load-bearing rather
// than decorative: benchmark headers render at wdth 84, which is what lets a
// label like "Terminal-Bench v2.1" fit a 108px column without truncation.
const uiFont = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-ui",
  display: "swap",
});

// Every numeral on the site — scores, the Index, ranks, prices, dates.
const dataFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-data",
  display: "swap",
  preload: false,
});

const title = "LM Board — Frontier Model Benchmark Leaderboard";
// The masthead used to carry this as a tagline beside the wordmark; the
// masthead now carries navigation instead, so the description has to be
// specific enough to stand on its own in a search result.
const description =
  "Frontier language models ranked on 8 benchmarks. Measured scores link to their publisher, retrieval date, and available evaluation settings; LM Board computes the Index and runs no evaluations.";

const initializationScript = `
  try {
    var storedTheme = null;
    try {
      storedTheme = window.localStorage.getItem("lmboard-theme");
    } catch (storageError) {}
    var hasStoredTheme = storedTheme === "light" || storedTheme === "dark";
    var resolvedTheme = hasStoredTheme
      ? storedTheme
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeSource = hasStoredTheme ? "explicit" : "system";
    var themeMeta = document.querySelector("meta[data-lmboard-theme-color]");
    if (themeMeta) {
      themeMeta.setAttribute("content", resolvedTheme === "light" ? "#eaeef5" : "#0b0d10");
    }
  } catch (error) {}
  try {
    if (window.location.pathname === "/") {
      var boardParams = new URLSearchParams(window.location.search);
      var boardKeys = ["tab", "sort", "direction", "view", "density", "q", "labs", "open"];
      var ownsBoardState = boardKeys.some(function (key) {
        return boardParams.has(key);
      });
      var boardHash = window.location.hash.slice(1);
      if (ownsBoardState || (boardHash && boardHash !== "top" && boardHash !== "leaderboard")) {
        document.documentElement.dataset.boardPending = "true";
        if (boardParams.has("q") || boardParams.has("labs") || boardParams.get("open") === "1") {
          document.documentElement.dataset.boardPendingFilters = "true";
        }
        window.setTimeout(function () {
          delete document.documentElement.dataset.boardPending;
          delete document.documentElement.dataset.boardPendingFilters;
        }, 12000);
      }
    }
    if (window.location.pathname === "/compare") {
      var compareModels = new URLSearchParams(window.location.search).get("models");
      if (compareModels && compareModels.split(",").some(function (id) { return id.trim(); })) {
        document.documentElement.dataset.comparePending = "true";
        window.setTimeout(function () {
          delete document.documentElement.dataset.comparePending;
        }, 12000);
      }
    }
  } catch (error) {}
`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "LM Board",
  title: {
    default: title,
    template: "%s — LM Board",
  },
  description,
  keywords: [
    "AI leaderboard",
    "LLM benchmarks",
    "language models",
    "model comparison",
    "frontier AI",
  ],
  authors: [{ name: "LM Board" }],
  creator: "LM Board",
  publisher: "LM Board",
  category: "technology",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "32x32", type: "image/x-icon" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=2",
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  // A neutral brand fallback for anything without its own card — 404 and the
  // global error boundary. It carries no `url`, so nothing can inherit an
  // address that is not its own.
  openGraph: {
    type: "website",
    siteName: "LM Board",
    locale: "en_US",
    title,
    description,
    images: [
      {
        url: "/og/home.png",
        width: 1200,
        height: 630,
        alt: "LM Board — frontier models ranked on cited benchmark scores",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og/home.png"],
  },
  // No `robots` here either. `index, follow` is the crawler default, so
  // declaring it bought nothing — and it was inherited by the not-found
  // boundary, which emitted Next's own `noindex` and then this, in that order.
  // Two contradictory directives on the 404, with the permissive one last.
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  // theme-color is emitted below rather than as two OS-media variants. An
  // explicit in-product theme can disagree with the OS; the before-paint
  // script and ThemeToggle keep that one tag aligned with the actual ground.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${uiFont.variable} ${dataFont.variable}`}
    >
      <head>
        <meta
          name="theme-color"
          content="#0b0d10"
          data-lmboard-theme-color=""
        />
        <script dangerouslySetInnerHTML={{ __html: initializationScript }} />
      </head>
      <body>
        {children}
        {/* Same-origin: serves /_vercel/insights/script.js and beacons to
            /_vercel/insights/event, so the CSP in vercel.json needs no change
            (script-src 'self', connect-src 'self'). Cookieless. */}
        <Analytics />
      </body>
    </html>
  );
}
