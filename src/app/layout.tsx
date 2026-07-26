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
});

const title = "LM Board — Frontier Model Benchmark Leaderboard";
const description = "Benchmark scores for frontier AI models.";

const themeInitializationScript = `
  try {
    var theme = window.localStorage.getItem("lmboard-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
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
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "LM Board",
    locale: "en_US",
    title,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "LM Board — curated frontier model benchmark scores",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
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
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
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
