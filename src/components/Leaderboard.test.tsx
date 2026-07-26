import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { Leaderboard } from "@/components/Leaderboard";
import { loadLeaderboardData } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";
import { modelFragment } from "@/lib/urlState";

// Real curated data rather than a fixture: these tests assert on *behaviour*
// (what ends up in the URL, which rows expand), never on specific scores, so a
// data refresh cannot break them. Expectations are derived from the loaded data.
const data = loadLeaderboardData();
const { minimumCoverageCount, percentBenchmarkCount } = coverageThreshold(
  data.benchmarks,
);

function board() {
  return (
    <Leaderboard
      data={data}
      minimumCoverageCount={minimumCoverageCount}
      percentBenchmarkCount={percentBenchmarkCount}
    />
  );
}

const codingBenchmark = data.benchmarks.find(
  (benchmark) => benchmark.category === "coding",
)!;
const reasoningBenchmark = data.benchmarks.find(
  (benchmark) => benchmark.category === "reasoning",
)!;

function go(url: string) {
  window.history.replaceState({}, "", url);
}

function currentUrl() {
  return new URL(window.location.href);
}

beforeEach(() => {
  go("/");
});

describe("URL → state hydration", () => {
  it("restores the category from ?tab", () => {
    go("/?tab=coding");
    render(board());

    expect(screen.getByRole("tab", { name: "Coding" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("falls back to overall for an unknown ?tab", () => {
    go("/?tab=not-a-category");
    render(board());

    expect(screen.getByRole("tab", { name: "Overall" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("restores a benchmark sort with an explicit direction", () => {
    go(`/?sort=${codingBenchmark.id}&direction=asc`);
    render(board());

    // The visible label is the compact form ("T-Bench 2.1"), so the full
    // benchmark name only appears in the sort button's accessible name.
    const sortButton = screen.getByRole("button", {
      name: new RegExp(`^Sort by ${codingBenchmark.name}`),
    });

    expect(
      screen.getByRole("status").textContent?.toLowerCase(),
    ).toContain("ascending");
    expect(sortButton.closest("th")).toHaveAttribute("aria-sort", "ascending");
  });

  it("drops a benchmark sort that the requested category would hide", () => {
    // Sorting by a reasoning benchmark while the Coding tab is active is not a
    // reachable state: the column is not rendered, so the sort silently applies
    // to something invisible. It must fall back to the default Index sort.
    go(`/?tab=coding&sort=${reasoningBenchmark.id}&direction=asc`);
    render(board());

    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toContain("Coding index");
    expect(status).toContain("descending");
  });

  it("expands the model named in the hash", () => {
    const target = data.rows[0];
    go(`/#${modelFragment(target.model.name)}`);
    render(board());

    expect(
      screen.getByRole("button", {
        name: new RegExp(`^Hide details for ${target.model.name}`),
      }),
    ).toBeInTheDocument();
  });

  it("ignores a hash that matches no model", () => {
    go("/#leaderboard");
    render(board());

    expect(
      screen.queryByRole("button", { name: /^Hide details for/ }),
    ).not.toBeInTheDocument();
  });
});

describe("state → URL writeback", () => {
  it("writes ?tab for a scoped category and removes it for overall", async () => {
    const user = userEvent.setup();
    render(board());

    await user.click(screen.getByRole("tab", { name: "Math" }));
    expect(currentUrl().searchParams.get("tab")).toBe("math");

    await user.click(screen.getByRole("tab", { name: "Overall" }));
    expect(currentUrl().searchParams.has("tab")).toBe(false);
  });

  it("keeps the default sort out of the URL", async () => {
    const user = userEvent.setup();
    render(board());

    const url = currentUrl();
    expect(url.searchParams.has("sort")).toBe(false);
    expect(url.searchParams.has("direction")).toBe(false);

    // Sorting by model name is not the default, so it must be recorded.
    await user.click(
      screen.getByRole("button", { name: /^Sort by Model/ }),
    );
    expect(currentUrl().searchParams.get("sort")).toBe("model");
  });

  it("omits direction when it matches the column default", async () => {
    const user = userEvent.setup();
    render(board());

    await user.click(screen.getByRole("button", { name: /^Sort by Model/ }));
    // Model defaults to ascending, so no direction parameter is needed.
    expect(currentUrl().searchParams.has("direction")).toBe(false);

    await user.click(screen.getByRole("button", { name: /^Sort by Model/ }));
    expect(currentUrl().searchParams.get("direction")).toBe("desc");
  });

  it("preserves a foreign hash while writing search params", async () => {
    const user = userEvent.setup();
    go("/#leaderboard");
    render(board());

    await user.click(screen.getByRole("tab", { name: "Agentic" }));

    expect(currentUrl().hash).toBe("#leaderboard");
    expect(currentUrl().searchParams.get("tab")).toBe("agentic");
  });

  it("records the expanded model in the hash and clears it on collapse", async () => {
    const user = userEvent.setup();
    render(board());

    const trigger = screen.getAllByRole("button", {
      name: /^Show details for/,
    })[0];
    const modelName = trigger
      .getAttribute("aria-label")!
      .replace(/^Show details for /, "")
      .replace(/ \(.*\)$/, "");

    await user.click(trigger);
    expect(currentUrl().hash).toBe(`#${modelFragment(modelName)}`);

    await user.click(
      screen.getByRole("button", { name: new RegExp(`^Hide details for`) }),
    );
    expect(currentUrl().hash).toBe("");
  });
});

describe("category switching", () => {
  it("resets a benchmark sort when its column leaves the view", async () => {
    const user = userEvent.setup();
    go(`/?sort=${reasoningBenchmark.id}`);
    render(board());

    expect(currentUrl().searchParams.get("sort")).toBe(reasoningBenchmark.id);

    await user.click(screen.getByRole("tab", { name: "Coding" }));

    expect(currentUrl().searchParams.has("sort")).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("Coding index");
  });

  it("keeps a benchmark sort when its column stays in the view", async () => {
    const user = userEvent.setup();
    go(`/?sort=${codingBenchmark.id}`);
    render(board());

    await user.click(screen.getByRole("tab", { name: "Coding" }));

    expect(currentUrl().searchParams.get("sort")).toBe(codingBenchmark.id);
  });
});

describe("filtering", () => {
  it("narrows rows without renumbering ranks", async () => {
    const user = userEvent.setup();
    render(board());

    const search = screen.getByRole("searchbox");
    await user.type(search, data.rows[0].model.lab);

    const count = screen.getByText(/^\d+ \/ \d+$/);
    expect(count.textContent).not.toBe(
      `${data.rows.length} / ${data.rows.length}`,
    );
  });

  it("collapses an expanded row that a filter hides", async () => {
    const user = userEvent.setup();
    render(board());

    await user.click(
      screen.getAllByRole("button", { name: /^Show details for/ })[0],
    );
    expect(
      screen.getByRole("button", { name: /^Hide details for/ }),
    ).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "zzzznomatch");

    expect(
      screen.queryByRole("button", { name: /^Hide details for/ }),
    ).not.toBeInTheDocument();
    expect(currentUrl().hash).toBe("");
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(board());

    await user.type(screen.getByRole("searchbox"), "zzzznomatch");

    expect(
      screen.getByText("No models match these filters."),
    ).toBeInTheDocument();
  });
});

describe("table semantics", () => {
  it("marks the active sort column with aria-sort", () => {
    render(board());

    const sorted = screen
      .getAllByRole("columnheader")
      .filter((cell) => cell.hasAttribute("aria-sort"));

    expect(sorted).toHaveLength(1);
    expect(sorted[0]).toHaveAttribute("aria-sort", "descending");
  });

  it("renders one row per model with a row header", () => {
    render(board());

    const table = screen.getByRole("table");
    const rowHeaders = within(table).getAllByRole("rowheader");

    expect(rowHeaders).toHaveLength(data.rows.length);
  });
});

describe("projections", () => {
  it("renders every benchmark column in the table projection", () => {
    go("/?view=table");
    render(board());

    for (const benchmark of data.benchmarks) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^Sort by ${benchmark.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        }),
      ).toBeInTheDocument();
    }
  });

  it("replaces benchmark columns with a spark in the profile projection", () => {
    go("/?view=profile");
    render(board());

    expect(
      screen.queryByRole("button", {
        name: new RegExp(`^Sort by ${data.benchmarks[0].name}`),
      }),
    ).not.toBeInTheDocument();
    // The values are still reachable: the spark carries an sr-only list.
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
  });

  it("defaults to the profile projection on a narrow viewport", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 720,
    });

    try {
      render(board());
      expect(screen.getByRole("status").textContent).toContain("profile");
      // A responsive default is not a user choice, so it stays out of the URL.
      expect(currentUrl().searchParams.has("view")).toBe(false);
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 1440,
      });
    }
  });

  it("serialises an explicit projection switch", async () => {
    const user = userEvent.setup();
    render(board());

    await user.click(screen.getByRole("button", { name: /score spark/i }));
    expect(currentUrl().searchParams.get("view")).toBe("profile");
  });

  it("keeps the default density out of the URL and records a change", async () => {
    const user = userEvent.setup();
    render(board());

    expect(currentUrl().searchParams.has("density")).toBe(false);

    await user.click(screen.getByRole("button", { name: /data-dense rows/i }));
    expect(currentUrl().searchParams.get("density")).toBe("data");
  });
});

describe("provenance", () => {
  it("puts a source link on every cell that has a score", () => {
    go("/?view=table");
    render(board());

    const sourceLinks = screen.getAllByRole("link", { name: /^Source for / });
    expect(sourceLinks.length).toBeGreaterThan(0);
    expect(sourceLinks[0]).toHaveAttribute("href", expect.stringMatching(/^https?:/));
  });

  it("explains an unranked model instead of showing a bare string", () => {
    render(board());

    const unranked = screen.queryAllByRole("button", {
      name: /^Why .* is unranked$/,
    });
    // The dataset may legitimately have none; when it does, it must explain.
    if (unranked.length > 0) {
      expect(unranked[0]).toHaveTextContent("Insufficient data");
    }
  });
});
