"use client";

type GlobalErrorProps = {
  reset: () => void;
};

/**
 * The last-resort boundary. It renders its own <html>, outside the root
 * layout, so it receives neither next/font's className nor anything else the
 * app sets up.
 *
 * It deliberately does NOT import globals.css. Doing so emitted a second full
 * copy of the stylesheet into the build for a route that is almost never hit,
 * and a boundary that depends on an external stylesheet loading is a boundary
 * that fails exactly when the page is already failing. These styles are
 * inline, self-contained, and use the system font stack.
 */
const criticalStyles = `
  :root { color-scheme: dark light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    padding: 56px 24px;
    background: #0b0d10;
    color: #e8ecf2;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.6;
  }
  @media (prefers-color-scheme: light) {
    body { background: #f4f6f9; color: #0d1117; }
  }
  .wrap { max-width: 62ch; margin: 0 auto; }
  .mark {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 17px; font-weight: 700; letter-spacing: -0.02em;
    text-transform: uppercase; margin-bottom: 56px;
  }
  .mark::before {
    content: ""; width: 9px; height: 9px; border-radius: 3px;
    background: #4da3ff;
  }
  .kicker {
    font-size: 11px; font-weight: 600; letter-spacing: 0.05em;
    text-transform: uppercase; color: #828d9a; margin: 0 0 16px;
  }
  h1 { margin: 0 0 16px; font-size: 40px; line-height: 1.05; letter-spacing: -0.03em; font-weight: 300; }
  p { margin: 0 0 28px; color: #a7b1bf; }
  @media (prefers-color-scheme: light) { p { color: #454f5b; } .kicker { color: #616c7a; } }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  button {
    min-height: 32px; padding: 6px 12px; border-radius: 5px;
    border: 1px solid #68727f; background: transparent; color: inherit;
    font: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
  }
  button:first-child { border-color: #4da3ff; }
  button:focus-visible { outline: 2px solid #4da3ff; outline-offset: 2px; }
`;

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <head>
        <title>LM Board — Error</title>
        <style dangerouslySetInnerHTML={{ __html: criticalStyles }} />
      </head>
      <body>
        <main className="wrap">
          <span className="mark">LM Board</span>
          <section role="alert">
            <p className="kicker">System error</p>
            <h1>The board hit a snag.</h1>
            <p>
              The page could not finish loading. Try again, or return to a fresh
              copy of the leaderboard.
            </p>
            <div className="actions">
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
