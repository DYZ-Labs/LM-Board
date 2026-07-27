import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompareGrid } from "@/components/CompareGrid";
import type {
  CompareBenchmark,
  CompareRow,
} from "@/lib/compare";
import { packCompareData } from "@/lib/compare";

const benchmarks: CompareBenchmark[] = [
  { id: "reasoning-test", name: "Reasoning Test" },
  { id: "coding-test", name: "Coding Test" },
];

const rows: CompareRow[] = [
  {
    id: "alpha",
    name: "Alpha",
    lab: "Lab A",
    releaseDate: "2026-07-01",
    openWeights: false,
    pricing: { input: 1, output: 2 },
    overallIndex: 91,
    scoresByBenchmark: {
      "reasoning-test": {
        value: 92.5,
        sourceUrl: "https://sources.example/alpha-reasoning",
        retrieved: "2026-07-20",
      },
      "coding-test": {
        value: 89,
        sourceUrl: "https://sources.example/alpha-coding",
        retrieved: "2026-07-21",
      },
    },
  },
  {
    id: "beta",
    name: "Beta",
    lab: "Lab B",
    releaseDate: "2026-06-01",
    openWeights: true,
    pricing: null,
    overallIndex: 88,
    scoresByBenchmark: {
      "reasoning-test": {
        value: 88,
        sourceUrl: "https://sources.example/beta-reasoning",
        retrieved: "2026-07-19",
      },
    },
  },
  {
    id: "gamma",
    name: "Gamma",
    lab: "Lab C",
    releaseDate: "2026-05-01",
    openWeights: false,
    pricing: { input: 2, output: 4 },
    overallIndex: 86,
    scoresByBenchmark: {},
  },
  {
    id: "delta",
    name: "Delta",
    lab: "Lab D",
    releaseDate: "2026-04-01",
    openWeights: false,
    pricing: { input: 3, output: 6 },
    overallIndex: 84,
    scoresByBenchmark: {},
  },
];

function go(url: string) {
  window.history.replaceState({}, "", url);
}

function comparison() {
  return (
    <CompareGrid
      payload={packCompareData({ rows, benchmarks })}
    />
  );
}

beforeEach(() => {
  go("/compare");
  delete document.documentElement.dataset.comparePending;
});

describe("initial comparison paint", () => {
  it("ships the stable empty state by default and opts deep links into the skeleton", () => {
    const markup = renderToStaticMarkup(comparison());
    const css = readFileSync(
      join(process.cwd(), "src/styles/record.css"),
      "utf8",
    );

    expect(markup).toContain("compare-initial-empty");
    expect(markup).toContain("compare-initial-skeleton");
    expect(css).toMatch(
      /\.compare-initial-skeleton\s*{\s*display:\s*none;/,
    );
    expect(css).toMatch(
      /html\[data-compare-pending="true"\]\s+\.compare-initial-skeleton\s*{\s*display:\s*block;/,
    );
  });

  it("keeps clean /compare on the same empty state after hydration", async () => {
    render(comparison());

    expect(
      await screen.findByText("0 / 4 selected"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".compare-grid.is-skeleton")).toBeNull();
    });
  });

  it("clears the pre-paint marker only after a deep-link selection commits", async () => {
    go("/compare?models=alpha,beta");
    document.documentElement.dataset.comparePending = "true";
    render(comparison());

    expect(
      await screen.findByRole("link", { name: "Alpha" }),
    ).toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute(
      "data-compare-pending",
    );
  });
});

describe("populated comparison", () => {
  it("shows benchmark values as plain, non-interactive numbers", async () => {
    go("/compare?models=alpha,beta");
    const { container } = render(comparison());

    await screen.findByRole("link", { name: "Alpha" });
    expect(container.querySelectorAll(".score-cell a")).toHaveLength(0);
    expect(container.querySelector(".score-cell")).toHaveTextContent("92.5");
    expect(screen.getByText(/Best score in each row/)).toBeInTheDocument();
  });

  it("restores focus after column removal and politely announces the count", async () => {
    go("/compare?models=alpha,beta");
    const user = userEvent.setup();
    render(comparison());

    const removeAlpha = await screen.findByRole("button", {
      name: "Remove Alpha from the comparison",
    });
    const removeBeta = screen.getByRole("button", {
      name: "Remove Beta from the comparison",
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "2 models selected: Alpha, Beta.",
    );

    removeAlpha.focus();
    await user.keyboard("{Enter}");

    expect(removeBeta).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 model selected: Beta.",
    );

    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("combobox", {
        name: "Add a model to the comparison",
      }),
    ).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No models selected.",
    );
  });
});

describe("stale comparison links", () => {
  it("canonicalizes unknown ids so they cannot consume the selection limit", async () => {
    go(
      "/compare?models=removed-one,removed-two,removed-three,removed-four",
    );
    const user = userEvent.setup();
    render(comparison());

    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.has("models")).toBe(
        false,
      );
    });

    const search = screen.getByRole("combobox", {
      name: "Add a model to the comparison",
    });
    expect(search).toBeEnabled();

    await user.type(search, "Alpha");
    await user.click(screen.getByRole("option", { name: "+ AlphaLab A" }));

    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get("models")).toBe(
        "alpha",
      );
    });
    expect(
      screen.getByRole("link", { name: "Alpha" }),
    ).toHaveAttribute("href", "/model/alpha");
  });
});

describe("model picker", () => {
  it("uses the shared fuzzy scorer and supports the combobox keyboard pattern", async () => {
    const user = userEvent.setup();
    render(comparison());

    const search = screen.getByRole("combobox", {
      name: "Add a model to the comparison",
    });
    await user.type(search, "Alpa");

    const option = screen.getByRole("option", { name: "+ AlphaLab A" });
    expect(search).toHaveAttribute("aria-activedescendant", option.id);

    await user.keyboard("{Enter}");

    expect(new URL(window.location.href).searchParams.get("models")).toBe(
      "alpha",
    );
    expect(screen.getByRole("link", { name: "Alpha" })).toBeInTheDocument();
  });

  it("announces a diagnostic empty result", async () => {
    const user = userEvent.setup();
    render(comparison());

    await user.type(
      screen.getByRole("combobox", {
        name: "Add a model to the comparison",
      }),
      "zzzznomatch",
    );

    expect(
      screen.getByText(/No models match “zzzznomatch”\./),
    ).toBeInTheDocument();
  });

  it("keeps keyboard focus on the picker when the fourth model reaches the limit", async () => {
    const user = userEvent.setup();
    render(comparison());
    const search = screen.getByRole("combobox", {
      name: "Add a model to the comparison",
    });

    for (const name of ["Alpha", "Beta", "Gamma", "Delta"]) {
      await user.type(search, name);
      await user.keyboard("{Enter}");
    }

    expect(search).toHaveFocus();
    expect(search).toHaveAttribute("readonly");
    expect(search).toHaveAttribute(
      "aria-describedby",
      "compare-model-limit",
    );
    expect(screen.getByText(/Maximum of 4 models selected/)).toBeInTheDocument();
  });

  it("uses one history entry and preserves foreign URL state", async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, "pushState");
    go("/compare?utm_source=test#comparison");
    render(comparison());

    const search = screen.getByRole("combobox", {
      name: "Add a model to the comparison",
    });
    await user.type(search, "Alpha");
    await user.keyboard("{Enter}");

    const url = new URL(window.location.href);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(url.searchParams.get("models")).toBe("alpha");
    expect(url.searchParams.get("utm_source")).toBe("test");
    expect(url.hash).toBe("#comparison");
    pushState.mockRestore();
  });
});
