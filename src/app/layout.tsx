import type { Metadata, Viewport } from "next";

import { siteUrl } from "@/lib/site";

import "./globals.css";

const title = "LM Board — Frontier Model Benchmark Leaderboard";
const description = "Curated benchmark scores for frontier language models.";

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
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
