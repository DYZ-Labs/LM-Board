import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: {
    index: false,
  },
};

export default function NotFound() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="site-identity">
          <a className="wordmark" href="/" aria-label="LM Board home">
            LM Board
          </a>
          <p>Benchmark scores for frontier AI models</p>
        </div>
      </header>
      <section className="not-found">
        <p className="section-kicker">404</p>
        <h1>This page isn&apos;t on the board.</h1>
        <p>
          The address may have changed or never existed. The leaderboard itself
          is one click away.
        </p>
        <a href="/">Back to the leaderboard</a>
      </section>
    </main>
  );
}
