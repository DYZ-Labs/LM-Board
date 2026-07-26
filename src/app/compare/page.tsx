import type { Metadata } from "next";
import Link from "next/link";

import { CompareGrid } from "@/components/CompareGrid";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastRegion } from "@/components/Toast";
import { loadLeaderboardData } from "@/lib/data";
import { repositoryUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Compare models",
  description:
    "Put frontier models side by side on every tracked benchmark, with a source citation behind each number.",
  alternates: { canonical: "/compare" },
};

export default function ComparePage() {
  const data = loadLeaderboardData();

  return (
    <>
      <a className="skip-link" href="#compare">
        Skip to the comparison
      </a>
      <main className="site-shell">
        <SiteMasthead
          id="top"
          actions={
            <>
              <Link className="btn" href="/">
                Leaderboard
              </Link>
              <ThemeToggle />
            </>
          }
        />
        <CompareGrid rows={data.rows} benchmarks={data.benchmarks} />
        <SiteFooter
          repositoryUrl={repositoryUrl}
          pageLink={{ href: "/#leaderboard", label: "Leaderboard" }}
        />
      </main>
      <ToastRegion />
    </>
  );
}
