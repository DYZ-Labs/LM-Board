import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChangeStrip } from "@/components/ChangeStrip";
import { FreshnessChip } from "@/components/FreshnessChip";
import { ProvenanceRibbon } from "@/components/ProvenanceRibbon";
import { Readout } from "@/components/Readout";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteMasthead } from "@/components/SiteMasthead";
import { summarizeChanges } from "@/lib/changes";
import { loadLeaderboardData } from "@/lib/data";
import { formatDate } from "@/lib/format";

const data = loadLeaderboardData();

/**
 * The claims the product is judged on are the ones a sceptic checks first, and
 * every one of them used to be a string literal someone had to remember to
 * update. These tests assert that each claim still agrees with data/*.json —
 * not that it reads a particular way.
 */
describe("the provenance claim", () => {
  it("promises linked sources for scores, not for every numeral", () => {
    const { container } = render(
      <ProvenanceRibbon
        scoreCount={data.scoreCount}
        modelCount={data.rows.length}
        benchmarkCount={data.benchmarks.length}
      />,
    );
    const text = container.textContent ?? "";

    expect(text).toContain("Every score links to the measurement it came from");
    // Prices, context windows and release dates carry no source and no
    // retrieval date, so a claim about "every number" is false on sight.
    expect(text.toLowerCase()).not.toContain("every number");
  });

  it("states the publisher split the dataset actually holds", () => {
    const { container } = render(
      <ProvenanceRibbon
        scoreCount={data.scoreCount}
        modelCount={data.rows.length}
        benchmarkCount={data.benchmarks.length}
      />,
    );
    const text = container.textContent ?? "";

    const artificialAnalysisCount = data.scoreCount - data.selfReportedCount;

    expect(text).toContain(String(data.scoreCount));
    expect(text).toContain(String(artificialAnalysisCount));
    expect(text).toContain(
      data.selfReportedCount === 0
        ? "no scores are vendor-published"
        : `model vendors publish ${data.selfReportedCount}, each marked Vendor`,
    );
  });

  it("claims evaluation settings only while every score carries them", () => {
    const scoresWithSettings = data.rows.reduce(
      (total, row) =>
        total +
        Object.values(row.scoresByBenchmark).filter((score) => score?.settings)
          .length,
      0,
    );
    const { container } = render(
      <ProvenanceRibbon
        scoreCount={data.scoreCount}
        modelCount={data.rows.length}
        benchmarkCount={data.benchmarks.length}
      />,
    );

    expect(
      (container.textContent ?? "").includes("the settings it was run under"),
    ).toBe(scoresWithSettings === data.scoreCount);
  });
});

describe("freshness", () => {
  it("reports the retrieval window rather than its last day", () => {
    const summary = summarizeChanges(data);
    const { container } = render(<ChangeStrip summary={summary} />);
    const text = container.textContent ?? "";

    expect(text).toContain(formatDate(summary.oldestRetrieved));
    expect(text).toContain(formatDate(summary.newestRetrieved));
    // "7 scores retrieved on Jul 25" counted the last day of a nine-day
    // collection and read as though the other 449 were older than they are.
    expect(text).not.toMatch(/\d+ scores? retrieved on/);
    expect(container.textContent).toContain("Model data feed");
  });

  it("names the newest score rather than implying the board was refreshed", () => {
    const { container } = render(<FreshnessChip date={data.lastUpdated} />);

    expect(container.textContent).toContain("Newest score");
  });
});

describe("page hierarchy and navigation", () => {
  it("uses a descriptive home h1 rather than the wordmark", () => {
    const { getByRole } = render(
      <Readout leader={data.rows[0]} lastUpdated={data.lastUpdated} />,
    );

    expect(
      getByRole("heading", {
        level: 1,
        name: "Frontier model benchmark index",
      }),
    ).toBeInTheDocument();
  });

  it("marks exactly the explicit current masthead route", () => {
    const { getByRole } = render(<SiteMasthead current="compare" />);

    expect(getByRole("link", { name: "Compare" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(getByRole("link", { name: "Leaderboard" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(getByRole("link", { name: "Methodology" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("the site footer", () => {
  it("keeps Methodology reachable whatever a route passes as its page link", () => {
    // Every model record and /compare passed a pageLink that *replaced* the
    // Methodology link, so the page justifying every number on the board was
    // unreachable from the 62 pages that show them.
    const { container } = render(
      <SiteFooter
        current="model"
        repositoryUrl={null}
        pageLink={{ href: "/#leaderboard", label: "Leaderboard" }}
      />,
    );
    const hrefs = [...container.querySelectorAll("nav a")].map((link) =>
      link.getAttribute("href"),
    );

    expect(hrefs).toContain("/methodology");
    expect(hrefs).toContain("/compare");
    expect(hrefs).toContain("/feed.xml");
    expect(container.textContent).toContain("Model data feed");
  });

  it("names Artificial Analysis in the independence disclaimer", () => {
    // The old disclaimer covered "model providers or benchmark authors" —
    // neither of which is the one organisation the board depends on.
    const { container } = render(
      <SiteFooter current="leaderboard" repositoryUrl={null} />,
    );

    expect(container.textContent).toContain("Artificial Analysis");
    expect(container.textContent).toContain("LM Board computes the Index and ranks");
    expect(container.textContent).not.toContain("curated");
  });

  it("marks an exact route as a page and a model record as a leaderboard location", () => {
    const { rerender } = render(
      <SiteFooter current="value" repositoryUrl={null} />,
    );

    expect(screen.getByRole("link", { name: "Value" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    rerender(<SiteFooter current="model" repositoryUrl={null} />);
    expect(
      screen.getByRole("link", { name: "Leaderboard" }),
    ).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Value" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
