import type { Metadata } from "next";
import Link from "next/link";

import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { repositoryUrl } from "@/lib/site";

import "@/styles/document.css";

// No `robots` here: Next emits `noindex` for the not-found boundary itself, and
// declaring it again put the directive in out/404.html twice.
export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    // See page.tsx: masthead and footer outside <main>, or the route has no
    // banner and no contentinfo landmark. The 404 had no footer at all, which
    // also made it the one route with no way back to the methodology.
    <>
      <div className="site-frame">
        <SiteMasthead id="top" />
        <main className="site-shell">
          <section className="not-found">
            <p className="section-kicker">404</p>
            <h1>This page isn&apos;t on the board.</h1>
            <p>
              The address may have changed or never existed. The leaderboard
              itself is one click away.
            </p>
            <Link className="btn btn-primary" href="/">
              Back to the leaderboard
            </Link>
          </section>
        </main>
        <SiteFooter current="not-found" repositoryUrl={repositoryUrl} />
      </div>
      <DeferredCommandPalette />
    </>
  );
}
