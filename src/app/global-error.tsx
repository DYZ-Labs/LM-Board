"use client";

import "./globals.css";

type GlobalErrorProps = {
  reset: () => void;
};

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <head>
        <title>LM Board — Error</title>
      </head>
      <body>
        <main className="site-shell">
          <header className="site-header">
            <div className="site-identity">
              <span className="wordmark">LM Board</span>
              <p>Benchmark scores for frontier AI models</p>
            </div>
          </header>
          <section className="not-found" role="alert">
            <p className="section-kicker">System error</p>
            <h1>The board hit a snag.</h1>
            <p>
              The page could not finish loading. Try again, or return to a fresh
              copy of the leaderboard.
            </p>
            <div className="global-error-actions">
              <button type="button" onClick={reset}>
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/")}
              >
                Reload the leaderboard
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
