import axe from "axe-core";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CompareGrid } from "@/components/CompareGrid";
import { Leaderboard } from "@/components/Leaderboard";
import { Methodology } from "@/components/Methodology";
import { ModelRecord } from "@/components/ModelRecord";
import { ProvenanceRibbon } from "@/components/ProvenanceRibbon";
import { Readout } from "@/components/Readout";
import { toComparePayload } from "@/lib/compare";
import { loadLeaderboardData } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";
import { toLeaderboardClientPayload } from "@/lib/leaderboardPayload";

const data = loadLeaderboardData();
const payload = toLeaderboardClientPayload(data);
const comparePayload = toComparePayload(data);
const { minimumCoverageCount, percentBenchmarkCount } = coverageThreshold(
  data.benchmarks,
);

/**
 * jsdom computes no layout and applies none of our stylesheet, so colour and
 * size rules cannot be judged here — contrast is covered by lib/contrast.test.ts
 * against the real tokens, and touch targets by the CSS in utilities.css. What
 * this suite does check is everything structural: roles, names, relationships,
 * heading order, duplicate ids, and form labelling.
 */
async function scan(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });

  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.html.slice(0, 120)),
  }));
}

describe("accessibility — no axe violations", () => {
  it("the board", async () => {
    const { container } = render(
      <main>
        <h1 id="leaderboard-heading">LM Board</h1>
        <Leaderboard
          payload={payload}
          minimumCoverageCount={minimumCoverageCount}
          percentBenchmarkCount={percentBenchmarkCount}
        />
      </main>,
    );

    expect(await scan(container)).toEqual([]);
  }, 30000);

  it("the board with a row expanded", async () => {
    const user = userEvent.setup();
    const { container, getAllByRole } = render(
      <main>
        <h1 id="leaderboard-heading">LM Board</h1>
        <Leaderboard
          payload={payload}
          minimumCoverageCount={minimumCoverageCount}
          percentBenchmarkCount={percentBenchmarkCount}
        />
      </main>,
    );

    await user.click(getAllByRole("button", { name: /^Show details for/ })[0]);
    expect(await scan(container)).toEqual([]);
  }, 30000);

  it("the board in the profile projection", async () => {
    // Structurally the most different projection: the spark is a list of links
    // inside a table cell, so list nesting and link naming are worth scanning.
    window.history.replaceState({}, "", "/?view=profile");

    try {
      const { container } = render(
        <main>
          <h1 id="leaderboard-heading">LM Board</h1>
          <Leaderboard
            payload={payload}
            minimumCoverageCount={minimumCoverageCount}
            percentBenchmarkCount={percentBenchmarkCount}
          />
        </main>,
      );

      expect(await scan(container)).toEqual([]);
    } finally {
      window.history.replaceState({}, "", "/");
    }
  }, 30000);

  it("the readout and provenance ribbon", async () => {
    const { container } = render(
      <main>
        <Readout leader={data.rows[0]} lastUpdated={data.lastUpdated} />
        <ProvenanceRibbon
          scoreCount={data.scoreCount}
          modelCount={data.rows.length}
          benchmarkCount={data.benchmarks.length}
        />
      </main>,
    );

    expect(await scan(container)).toEqual([]);
  }, 20000);

  it("a model record", async () => {
    const { container } = render(
      <main>
        <ModelRecord row={data.rows[0]} benchmarks={data.benchmarks} />
      </main>,
    );

    expect(await scan(container)).toEqual([]);
  }, 20000);

  it("the methodology page", async () => {
    const { container } = render(
      <main>
        <Methodology
          benchmarks={data.benchmarks}
          percentBenchmarkCount={percentBenchmarkCount}
          minimumCoverageCount={minimumCoverageCount}
          issuesUrl="https://github.com/DYZ-Labs/LM-Board/issues"
        />
      </main>,
    );

    expect(await scan(container)).toEqual([]);
  }, 20000);

  it("the compare grid", async () => {
    const { container } = render(
      <main>
        <CompareGrid payload={comparePayload} />
      </main>,
    );

    expect(await scan(container)).toEqual([]);
  }, 20000);
});

describe("keyboard paths", () => {
  it("gives the tablist one tab stop and arrow-key navigation", async () => {
    const user = userEvent.setup();
    const { getAllByRole, getByRole } = render(
      <main>
        <h1 id="leaderboard-heading">LM Board</h1>
        <Leaderboard
          payload={payload}
          minimumCoverageCount={minimumCoverageCount}
          percentBenchmarkCount={percentBenchmarkCount}
        />
      </main>,
    );

    const tabs = getAllByRole("tab");
    // Exactly one tab is reachable by Tab; the rest are reached with arrows.
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") !== "-1")).toHaveLength(1);

    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(getByRole("tab", { name: "Reasoning" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{End}");
    expect(getByRole("tab", { name: "Agentic" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{Home}");
    expect(getByRole("tab", { name: "Overall" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }, 20000);

  it("labels the board region and links it to the active tab", () => {
    const { getByRole } = render(
      <main>
        <h1 id="leaderboard-heading">LM Board</h1>
        <Leaderboard
          payload={payload}
          minimumCoverageCount={minimumCoverageCount}
          percentBenchmarkCount={percentBenchmarkCount}
        />
      </main>,
    );

    const panel = getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", "tab-overall");
  });

  it("renders leaderboard scores as non-interactive text", () => {
    const { container } = render(
      <main>
        <h1 id="leaderboard-heading">LM Board</h1>
        <Leaderboard
          payload={payload}
          minimumCoverageCount={minimumCoverageCount}
          percentBenchmarkCount={percentBenchmarkCount}
        />
      </main>,
    );

    const measuredCells = [
      ...container.querySelectorAll<HTMLElement>(
        ".score-cell:not(.missing-value)",
      ),
    ];
    expect(measuredCells.length).toBeGreaterThan(100);
    expect(
      measuredCells.every((cell) => cell.querySelector("a, button") === null),
    ).toBe(true);
  });
});
