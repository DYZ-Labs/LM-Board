import type { Metadata } from "next";

import "./globals.css";

const themeInitializationScript = `
  try {
    var theme = window.localStorage.getItem("lmboard-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
  } catch (error) {}
`;

export const metadata: Metadata = {
  title: "LM Board",
  description: "Curated benchmark scores for frontier language models.",
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
