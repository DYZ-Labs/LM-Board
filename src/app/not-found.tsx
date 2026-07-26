import type { Metadata } from "next";
import Link from "next/link";

import { SiteMasthead } from "@/components/SiteMasthead";

export const metadata: Metadata = {
  title: "Page not found",
  robots: {
    index: false,
  },
};

export default function NotFound() {
  return (
    <main className="site-shell">
      <SiteMasthead />
      <section className="not-found">
        <p className="section-kicker">404</p>
        <h1>This page isn&apos;t on the board.</h1>
        <p>
          The address may have changed or never existed. The leaderboard itself
          is one click away.
        </p>
        <Link className="btn btn-primary" href="/">
          Back to the leaderboard
        </Link>
      </section>
    </main>
  );
}
