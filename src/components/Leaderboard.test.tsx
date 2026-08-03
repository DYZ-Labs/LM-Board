import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  Leaderboard,
  transitionBoardProjection,
} from "@/components/Leaderboard";
import { loadLeaderboardData } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";
import { toLeaderboardClientPayload } from "@/lib/leaderboardPayload";
import { modelFragment } from "@/lib/urlState";

// Real curated data rather than a fixture: these tests assert on *behaviour*
// (what ends up in the URL, which rows expand), never on specific scores, so a
// data refresh cannot break them. Expectations are derived from the loaded data.
const data = loadLeaderboardData();
const payload = toLeaderboardClientPayload(data);
const { minimumCoverageCount, percentBenchmarkCount } = coverageThreshold(
  data.benchmarks,
);

function board() {
  return (
    <Leaderboard
      payload={payload}
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

  it("restores popstate without writing the URL back", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(board());
    replaceState.mockClear();

    act(() => {
      window.history.replaceState(
        {},
        "",
        "/?tab=math&utm_source=history",
      );
      replaceState.mockClear();
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByRole("tab", { name: "Math" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(currentUrl().searchParams.get("utm_source")).toBe("history");
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
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
    const modelId = trigger
      .getAttribute("aria-controls")!
      .replace(/^details-/, "");
    const modelName = data.rows.find((row) => row.model.id === modelId)!.model
      .name;

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

  it("shows estimated category Indexes without an estimate badge", async () => {
    const user = userEvent.setup();
    render(board());

    await user.click(screen.getByRole("tab", { name: "Agentic" }));

    expect(screen.queryByText(/^\d+ est\.$/)).not.toBeInTheDocument();
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

  it.each([
    ["gpt5", "GPT-5"],
    ["gpt 5", "GPT-5"],
    ["anthropic opus", "Claude Opus 5"],
    ["clade", "Claude Opus 5"],
  ])("uses the shared fuzzy matcher for %j", async (query, expected) => {
    const user = userEvent.setup();
    render(board());

    await user.type(screen.getByRole("searchbox"), query);

    expect(screen.getByText(expected, { exact: true })).toBeInTheDocument();
  });
});

// The Copy view button copies window.location.href verbatim, so anything a
// filter does that the URL does not record is silently dropped from the link —
// the recipient of a shared board would see a different board than the sharer.
describe("filters survive a round trip through the URL", () => {
  it("records the search query and keeps an empty one out", async () => {
    const user = userEvent.setup();
    render(board());

    expect(currentUrl().searchParams.has("q")).toBe(false);

    await user.type(screen.getByRole("searchbox"), "opus");
    expect(currentUrl().searchParams.get("q")).toBe("opus");

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(currentUrl().searchParams.has("q")).toBe(false);
  });

  it("restores the search query from ?q", () => {
    go("/?q=opus");
    render(board());

    expect(screen.getByRole("searchbox")).toHaveValue("opus");
  });

  it("records the open-weights filter and restores it", async () => {
    const user = userEvent.setup();
    render(board());

    await user.click(screen.getByRole("checkbox", { name: "Open weights" }));
    expect(currentUrl().searchParams.get("open")).toBe("1");
  });

  it("restores the open-weights filter from ?open", () => {
    go("/?open=1");
    render(board());

    expect(screen.getByRole("checkbox", { name: "Open weights" })).toBeChecked();
  });

  it("records the proprietary filter and shows only proprietary models", async () => {
    const user = userEvent.setup();
    render(board());

    await user.click(screen.getByRole("checkbox", { name: "Proprietary" }));

    const expectedIds = new Set(
      data.rows
        .filter((row) => !row.model.openWeights)
        .map((row) => row.model.id),
    );
    const visibleIds = new Set(
      screen
        .getAllByRole("button", { name: /^Show details for/ })
        .map((button) =>
          button.getAttribute("aria-controls")!.replace(/^details-/, ""),
        ),
    );

    expect(currentUrl().searchParams.get("proprietary")).toBe("1");
    expect(visibleIds).toEqual(expectedIds);
  });

  it("restores the proprietary filter from ?proprietary", () => {
    go("/?proprietary=1");
    render(board());

    expect(screen.getByRole("checkbox", { name: "Proprietary" })).toBeChecked();
  });

  it("records selected providers and restores them", () => {
    const lab = data.labs[0];
    go(`/?labs=${encodeURIComponent(lab)}`);
    render(board());

    // The count pip beside the Filters summary reflects the restored selection.
    expect(screen.getByText("Filters").textContent).toContain("1");
    // …and the chip names it, so a shared link says what it is narrowed to.
    expect(
      screen.getByRole("button", { name: `Remove filter ${lab}` }),
    ).toBeInTheDocument();
  });

  it("distinguishes the default all-provider state from explicit none", async () => {
    const user = userEvent.setup();
    go("/?labs=none");
    render(board());

    expect(
      screen.getByText("No models match these filters."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter No providers" }),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Filters"));
    for (const lab of data.labs) {
      expect(screen.getByRole("checkbox", { name: lab })).not.toBeChecked();
    }
    expect(currentUrl().searchParams.get("labs")).toBe("none");
  });

  it("shows every provider checked when the provider filter is absent", async () => {
    const user = userEvent.setup();
    render(board());

    await user.click(screen.getByText("Filters"));
    for (const lab of data.labs) {
      expect(screen.getByRole("checkbox", { name: lab })).toBeChecked();
    }
    expect(currentUrl().searchParams.has("labs")).toBe(false);
  });

  it("gives the filter checkboxes one tab stop and roving arrow navigation", async () => {
    const user = userEvent.setup();
    render(board());
    const summary = screen.getByText("Filters");
    await user.click(summary);
    const options = screen.getAllByRole("checkbox");

    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    expect(options[0]).toHaveAttribute("tabindex", "0");

    options[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(options[1]);
    expect(options.filter((option) => option.tabIndex === 0)).toEqual([
      options[1],
    ]);

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(options.at(-1));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(options[0]);

    await user.keyboard(" ");
    expect(options[0]).not.toBeChecked();
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(summary);
    expect(options[0]).toBeChecked();
  });

  it("flips a desktop filter popover before it can cross the viewport edge", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 700,
    });
    render(board());
    const summary = screen.getByText("Filters");
    const disclosure = summary.closest("details")!;
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue({
      bottom: 40,
      height: 32,
      left: 600,
      right: 680,
      top: 8,
      width: 80,
      x: 600,
      y: 8,
      toJSON: () => ({}),
    });

    try {
      await user.click(summary);
      expect(disclosure).toHaveAttribute("data-popover-align", "end");
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 1440,
      });
    }
  });

  it("keeps the filter popover inside a short landscape viewport", async () => {
    const user = userEvent.setup();
    Object.defineProperties(window, {
      innerHeight: {
        configurable: true,
        writable: true,
        value: 320,
      },
      innerWidth: {
        configurable: true,
        writable: true,
        value: 640,
      },
    });
    render(board());
    const summary = screen.getByText("Filters");
    const disclosure = summary.closest("details")!;
    vi.spyOn(summary, "getBoundingClientRect").mockReturnValue({
      bottom: 282,
      height: 32,
      left: 12,
      right: 92,
      top: 250,
      width: 80,
      x: 12,
      y: 250,
      toJSON: () => ({}),
    });

    try {
      await user.click(summary);
      expect(disclosure).toHaveAttribute("data-popover-vertical", "above");
      expect(disclosure.style.getPropertyValue("--popover-available-block")).toBe(
        "232px",
      );
    } finally {
      Object.defineProperties(window, {
        innerHeight: {
          configurable: true,
          writable: true,
          value: 768,
        },
        innerWidth: {
          configurable: true,
          writable: true,
          value: 1440,
        },
      });
    }
  });

  it("ignores a provider that is not in the dataset", () => {
    go("/?labs=NotARealProvider");
    render(board());

    // Rather than filtering every row away and leaving an empty board.
    expect(
      screen.queryByText("No models match these filters."),
    ).not.toBeInTheDocument();
    expect(currentUrl().searchParams.has("labs")).toBe(false);
  });

  it("groups a typing gesture into one history entry", async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, "pushState");
    render(board());

    await user.type(screen.getByRole("searchbox"), "anthropic opus");

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(currentUrl().searchParams.get("q")).toBe("anthropic opus");
    pushState.mockRestore();
  });

  it("groups a provider-popover session into one history entry", async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, "pushState");
    render(board());

    const summary = screen.getByText("Filters");
    await user.click(summary);
    await user.click(screen.getByRole("checkbox", { name: data.labs[0] }));
    await user.click(screen.getByRole("checkbox", { name: data.labs[1] }));
    await user.click(summary);

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(currentUrl().searchParams.get("labs")).toBe(
      data.labs.slice(2).join(","),
    );
    pushState.mockRestore();
  });

  it("copies the synchronously updated filtered URL", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      render(board());
      await user.type(screen.getByRole("searchbox"), "opus");
      await user.click(screen.getByRole("button", { name: "Copy view" }));

      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("?q=opus"),
      );
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: previousClipboard,
      });
    }
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

    const table = screen.getByRole("grid");
    const rowHeaders = within(table).getAllByRole("rowheader");

    expect(rowHeaders).toHaveLength(data.rows.length);
  });

  it("assigns every roving-grid coordinate to exactly one cell", () => {
    const { container } = render(board());
    const cells = [
      ...container.querySelectorAll<HTMLElement>('[id^="board-cell-"]'),
    ];
    const ids = cells.map((cell) => cell.id);
    const grid = screen.getByRole("grid");

    expect(new Set(ids).size).toBe(ids.length);
    expect(
      cells.filter((cell) => cell.id === grid.getAttribute("aria-activedescendant")),
    ).toHaveLength(1);
  });

  it("keeps secondary actions in a grid cell keyboard-reachable", async () => {
    const user = userEvent.setup();
    render(board());
    const grid = screen.getByRole("grid");

    grid.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{F2}");

    const indexHeader = screen
      .getByRole("button", {
        name: /^Sort by LM Intelligence Index/,
      })
      .closest("th")!;
    const actions = within(indexHeader).getAllByRole("button");
    expect(document.activeElement).toBe(actions[0]);

    await user.tab();
    expect(document.activeElement).toBe(actions[1]);

    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(grid);

    await user.keyboard("{ArrowDown}{ArrowLeft}{F2}");
    const firstModelCell = document.querySelector<HTMLElement>(
      ".model-row .model-cell",
    )!;
    const modelActions = within(firstModelCell).getAllByRole("button")
      .concat(within(firstModelCell).getAllByRole("link"));
    expect(document.activeElement).toBe(modelActions[0]);

    await user.tab();
    expect(document.activeElement).toBe(modelActions[1]);
  });

  it("keeps a closing detail row mounted and inert until its transition ends", async () => {
    const user = userEvent.setup();
    const { container } = render(board());
    const show = screen.getAllByRole("button", {
      name: /^Show details for/,
    })[0];
    const detailsId = show.getAttribute("aria-controls")!;

    await user.click(show);
    const collapse = container.querySelector<HTMLElement>(
      `#${detailsId} .detail-collapse`,
    )!;
    await waitFor(() => expect(collapse).toHaveAttribute("data-state", "open"));

    await user.click(
      screen.getByRole("button", { name: /^Hide details for/ }),
    );
    expect(collapse).toHaveAttribute("data-state", "closing");
    expect(collapse).toHaveAttribute("inert");
    expect(container.querySelector(`#${detailsId}`)).toBeInTheDocument();

    fireEvent.transitionEnd(collapse, {
      propertyName: "grid-template-rows",
    });
    expect(container.querySelector(`#${detailsId}`)).not.toBeInTheDocument();
  });

  it("keeps benchmark score cells plain and non-interactive", async () => {
    const user = userEvent.setup();
    const { container } = render(board());
    const grid = screen.getByRole("grid");
    const firstScore = container.querySelector<HTMLElement>(
      ".model-row .score-cell:not(.missing-value)",
    )!;

    expect(firstScore).toBeInTheDocument();
    expect(firstScore.querySelector("a, button")).toBeNull();

    grid.focus();
    await user.keyboard(
      "{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}{Enter}",
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(grid);
  });
});

describe("projections", () => {
  it("shows only the Index benchmarks in their editorial priority order", () => {
    go("/?view=table");
    const { container } = render(board());

    expect(data.benchmarks.map((benchmark) => benchmark.id)).toEqual([
      "terminal-bench-v2-1",
      "tau3-banking",
      "aa-lcr",
      "hle",
      "gpqa-diamond",
      "scicode",
      "ifbench",
      "critpt",
    ]);

    const benchmarkHeaders = [
      ...container.querySelectorAll<HTMLTableCellElement>(
        "thead .benchmark-column",
      ),
    ];
    expect(
      benchmarkHeaders.map((header) =>
        header.querySelector("button")?.getAttribute("aria-label"),
      ),
    ).toEqual(
      data.benchmarks.map((benchmark) =>
        expect.stringMatching(`^Sort by ${benchmark.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      ),
    );
  });

  it("uses the Intelligence Index name in the label and hover text", () => {
    render(board());

    const indexSort = screen.getByRole("button", {
      name: /^Sort by LM Intelligence Index/,
    });
    expect(indexSort).toHaveTextContent("LM Intelligence Index");
    expect(indexSort.querySelector("[title]")).toHaveAttribute(
      "title",
      "LM Intelligence Index",
    );
    expect(
      screen.getByRole("button", {
        name: "About LM Intelligence Index",
      }),
    ).toBeInTheDocument();
  });

  it("renders every benchmark column in the table projection", () => {
    go("/?view=table");
    const { container } = render(board());

    for (const benchmark of data.benchmarks) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^Sort by ${benchmark.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        }),
      ).toBeInTheDocument();
    }

    expect(container.querySelector(".index-column")).not.toHaveClass(
      "is-inset",
    );
    expect(
      container.querySelector(".benchmark-column.is-inset .sort-button"),
    ).toHaveAccessibleName(/^Sort by CritPt/);
    expect(
      container.querySelectorAll(".score-cell.is-inset"),
    ).toHaveLength(data.rows.length);
  });

  it("replaces benchmark columns with a spark in the profile projection", () => {
    go("/?view=profile");
    render(board());

    expect(
      screen.queryByRole("button", {
        name: new RegExp(`^Sort by ${data.benchmarks[0].name}`),
      }),
    ).not.toBeInTheDocument();
    // The values are still reachable: the spark is a real list of them.
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
  });

  it("reads out every score in the profile projection", () => {
    // The projection most viewports default to used to render an aria-hidden
    // graphic whose values lived only in a `title`. The values are now text.
    go("/?view=profile");
    const { container } = render(board());

    const readouts = [...container.querySelectorAll(".spark-slot .sr-only")];
    expect(readouts.length).toBeGreaterThan(100);
    // Benchmark and value, so the mark is never height or colour alone.
    expect(readouts[0]!.textContent).toMatch(/^.+: (\d+\.\d|no curated score)$/);
  });

  it("routes profile provenance through the model record, not the bars", async () => {
    // Each bar was a 5x22px link: 440 WCAG 2.5.8 failures and 456 tab stops,
    // and the halo that would fix the size would steal the neighbouring rows'
    // taps. The sources move to the one control the row already has.
    go("/?view=profile");
    const { container } = render(board());

    expect(container.querySelectorAll("a.spark-bar")).toHaveLength(0);

    const row = data.rows.find((candidate) =>
      data.benchmarks.every(
        (benchmark) => candidate.scoresByBenchmark[benchmark.id],
      ),
    )!;
    await userEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`^Show details for ${row.model.name}`),
      }),
    );

    const panel = screen.getByRole("region", {
      name: `${row.model.name} details`,
    });
    expect(
      within(panel).getByText(/complete benchmark evidence table/i),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: "Open model page" }),
    ).toHaveAttribute(
      "href",
      `/model/${row.model.id}`,
    );
  });

  it("keeps the board's grid hint present in both projections", () => {
    // The server renders `table` and narrow viewports flip to `profile` on
    // mount, so an element in one and not the other shifts the page after
    // hydration.
    go("/?view=table");
    const table = render(board());
    expect(
      table.container.querySelector("#board-grid-instructions"),
    ).toBeInTheDocument();
    table.unmount();

    go("/?view=profile");
    const profile = render(board());
    expect(
      profile.container.querySelector("#board-grid-instructions"),
    ).toBeInTheDocument();
  });

  it("keeps the static table projection on a narrow viewport", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 390,
    });

    try {
      render(board());
      expect(screen.getByRole("status").textContent).toContain("table");
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^Sort by ${data.benchmarks[0].name}`),
        }),
      ).toBeInTheDocument();
      // CSS adapts this one projection; hydration does not swap the DOM.
      expect(currentUrl().searchParams.has("view")).toBe(false);
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: 1440,
      });
    }
  });

  it("offers touch sorting while the mobile column header is clipped", async () => {
    const user = userEvent.setup();
    const { container } = render(board());
    const selector = screen.getByRole("combobox", {
      name: "Sort leaderboard by",
    });

    await user.selectOptions(selector, `benchmark:${codingBenchmark.id}`);
    expect(currentUrl().searchParams.get("sort")).toBe(codingBenchmark.id);
    const featured = [
      ...container.querySelectorAll(".score-cell.is-mobile-sort-score"),
    ];
    expect(featured).toHaveLength(data.rows.length);
    expect(featured[0]).toHaveTextContent(codingBenchmark.name);
    expect(
      featured.every((cell) => cell.querySelector("a, button") === null),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Sort ascending" }));
    expect(currentUrl().searchParams.get("direction")).toBe("asc");
    expect(
      screen.getByRole("button", { name: "Sort descending" }),
    ).toHaveTextContent("Sort descending ↓");
  });

  it("puts a full-size evidence route on every mobile card", () => {
    const { container } = render(board());
    const links = [
      ...container.querySelectorAll<HTMLAnchorElement>(
        ".model-row .mobile-evidence-link",
      ),
    ];

    expect(links).toHaveLength(data.rows.length);
    expect(links[0]).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/model\/.+#record-scores$/),
    );
    expect(links[0]).toHaveTextContent(/^Evidence · \d+ scores$/);
  });

  it("does not render projection controls in the command bar", () => {
    render(board());

    expect(
      screen.queryByRole("group", { name: "Projection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Table —/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Profile —/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Plot —/ }),
    ).not.toBeInTheDocument();
  });

  it("bypasses view transitions in reduced-motion mode", () => {
    const originalMatchMedia = window.matchMedia;
    const startViewTransition = vi.fn();
    const update = vi.fn();
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    window.matchMedia = ((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    try {
      transitionBoardProjection(update);

      expect(update).toHaveBeenCalledTimes(1);
      expect(startViewTransition).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = originalMatchMedia;
      Reflect.deleteProperty(document, "startViewTransition");
    }
  });

});

describe("row density", () => {
  it("keeps the default density without offering a control", () => {
    const { container } = render(board());

    expect(container.querySelector(".leaderboard")).toHaveAttribute(
      "data-density",
      "compact",
    );
    expect(
      screen.queryByRole("group", { name: /row density/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Rows$/i }),
    ).not.toBeInTheDocument();
  });

  it("ignores and removes a legacy density parameter", () => {
    go("/?density=comfortable");
    const { container } = render(board());

    expect(container.querySelector(".leaderboard")).toHaveAttribute(
      "data-density",
      "compact",
    );
    expect(currentUrl().searchParams.has("density")).toBe(false);
  });
});

describe("provenance", () => {
  it("keeps source links out of leaderboard score cells", () => {
    go("/?view=table");
    const { container } = render(board());

    const measuredCells = [
      ...container.querySelectorAll<HTMLElement>(
        ".score-cell:not(.missing-value)",
      ),
    ];
    expect(measuredCells.length).toBeGreaterThan(0);
    expect(
      measuredCells.every((cell) => cell.querySelector("a, button") === null),
    ).toBe(true);
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

  it("keeps unmeasured benchmark cells in the mobile score-cell set", () => {
    const missing = data.rows.find((row) =>
      data.benchmarks.some(
        (benchmark) => row.scoresByBenchmark[benchmark.id] == null,
      ),
    );
    expect(missing).toBeDefined();

    const { container } = render(board());
    const row = container.querySelector(
      `#${modelFragment(missing!.model.name)}`,
    );

    expect(row?.querySelector(".score-cell.missing-value")).toBeInTheDocument();
  });
});
