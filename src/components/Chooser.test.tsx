import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Chooser } from "@/components/Chooser";
import { CHOOSER_TASKS, toChooserPayload } from "@/lib/chooser";
import type { LeaderboardData, LeaderboardRow, LeaderboardScope } from "@/lib/data";

function scope(index: number | null, rank: number | null): LeaderboardScope {
  return {
    index,
    rank,
    coverageCount: index === null ? 1 : 4,
    coverageTotal: 4,
    coverageRatio: index === null ? 0.25 : 1,
    estimatedCount: index === null ? 0 : 1,
    rankedFieldSize: index === null ? 0 : 4,
  };
}

function row(
  id: string,
  options: {
    index: number | null;
    rank: number | null;
    input: number;
    output: number;
    context: number;
    open?: boolean;
  },
): LeaderboardRow {
  const summary = scope(options.index, options.rank);
  return {
    model: {
      id,
      name: id[0].toUpperCase() + id.slice(1),
      lab: "Test Lab",
      releaseDate: "2026-07-01",
      openWeights: options.open ?? false,
      contextWindow: options.context,
      pricing: {
        input: options.input,
        output: options.output,
        source: {
          url: `https://example.com/${id}/pricing`,
          retrieved: "2026-08-03",
        },
      },
      url: `https://example.com/${id}`,
    },
    reasoningEffort: null,
    reasoningEffortLabel: null,
    scoresByBenchmark: {},
    rampByBenchmark: {},
    scopes: Object.fromEntries(
      CHOOSER_TASKS.map((task) => [task, { ...summary }]),
    ) as LeaderboardRow["scopes"],
  };
}

const rows = [
  row("alpha", { index: 99, rank: 1, input: 1, output: 2, context: 1000000, open: true }),
  row("beta", { index: 98, rank: 2, input: 2, output: 4, context: 400000 }),
  row("gamma", { index: 97, rank: 3, input: 3, output: 6, context: 200000 }),
  row("delta", { index: 96, rank: 4, input: 4, output: 8, context: 128000 }),
  row("unranked", { index: null, rank: null, input: 0, output: 0, context: 1000000, open: true }),
];
const payload = toChooserPayload({ rows } as Pick<LeaderboardData, "rows">);

function chooser() {
  return <Chooser payload={payload} />;
}

function go(url: string) {
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  go("/choose");
  delete document.documentElement.dataset.choosePending;
});

describe("chooser initial state", () => {
  it("server-renders the default shortlist and a deep-link skeleton", () => {
    const markup = renderToStaticMarkup(chooser());
    const css = readFileSync(
      join(process.cwd(), "src/styles/chooser.css"),
      "utf8",
    );

    expect(markup).toContain("chooser-results-live");
    expect(markup).toContain("chooser-initial-skeleton");
    expect(markup).toContain("Capability leader");
    expect(css).toMatch(
      /html\[data-choose-pending="true"\]\s+\.chooser-results-live\s*{\s*display:\s*none;/,
    );
  });

  it("hydrates a shared URL before clearing the pre-paint marker", async () => {
    go("/choose?task=coding&access=api&context=400k&input=2&output=10");
    document.documentElement.dataset.choosePending = "true";
    render(chooser());

    expect(await screen.findByRole("heading", { name: "Coding recommendations" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Hosted API/ })).toBeChecked();
    expect(screen.getByRole("combobox", { name: /Minimum context/ })).toHaveValue("400000");
    expect(screen.getByRole("spinbutton", { name: /Maximum input price/ })).toHaveValue(2);
    expect(document.documentElement).not.toHaveAttribute("data-choose-pending");
  });
});

describe("chooser application", () => {
  it("keeps draft controls separate, canonicalizes the URL, and focuses updated results", async () => {
    go("/choose?utm_source=test");
    const user = userEvent.setup();
    render(chooser());
    await screen.findByText(/4 models shown from 4 ranked candidates/);

    const cap = screen.getByRole("spinbutton", { name: /Maximum input price/ });
    await user.type(cap, "0");
    expect(screen.getAllByRole("link", { name: "Open model record" })).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Update shortlist" }));
    const heading = screen.getByRole("heading", { name: "Overall recommendations" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("heading", { name: /No ranked models/ })).toBeInTheDocument();
    const url = new URL(window.location.href);
    expect(url.searchParams.get("input")).toBe("0");
    expect(url.searchParams.get("utm_source")).toBe("test");
    expect(url.searchParams.has("task")).toBe(false);
  });

  it("shows inline validation and leaves the applied shortlist untouched", async () => {
    const user = userEvent.setup();
    render(chooser());
    await screen.findByText(/4 models shown/);
    const cap = screen.getByRole("spinbutton", { name: /Maximum input price/ });
    fireEvent.change(cap, { target: { value: "-1" } });

    await user.click(screen.getByRole("button", { name: "Update shortlist" }));
    expect(screen.getByText("Price cannot be negative.")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(new URL(window.location.href).searchParams.has("input")).toBe(false);
  });

  it("restores applied controls and results on browser history navigation", async () => {
    render(chooser());
    await screen.findByText(/4 models shown/);

    window.history.pushState({}, "", "/choose?access=open&context=1m");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByRole("radio", { name: /Open weights/ })).toBeChecked();
    expect(screen.getByRole("combobox", { name: /Minimum context/ })).toHaveValue("1000000");
    expect(screen.getByText(/1 model shown from 1 ranked candidate/)).toBeInTheDocument();
  });
});

describe("shortlist actions and evidence", () => {
  it("renders multi-label cards, price citations, and compare order", async () => {
    render(chooser());
    await screen.findByText(/4 models shown/);

    for (const label of [
      "Capability leader",
      "Lowest input price",
      "Largest context",
      "Open-weights leader",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link", { name: /Official pricing/ })).toHaveLength(4);
    expect(screen.getAllByText(/Checked Aug 3, 2026/)).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Compare shortlist" })).toHaveAttribute(
      "href",
      "/compare?models=alpha,beta,gamma,delta",
    );
  });

  it("copies an exactly reproducible shortlist URL", async () => {
    go("/choose?task=math&access=api&utm_source=test");
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      render(chooser());
      await screen.findByRole("heading", { name: "Math recommendations" });
      await user.click(screen.getByRole("button", { name: "Copy shortlist" }));
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/choose?task=math&access=api&utm_source=test"),
      );
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: previousClipboard,
      });
    }
  });

  it("offers explicit recovery without silently changing constraints", async () => {
    go("/choose?input=0");
    const user = userEvent.setup();
    render(chooser());

    await screen.findByRole("heading", { name: /No ranked models/ });
    expect(screen.getByText("After price").nextSibling).toHaveTextContent("1");
    expect(screen.getByText(/1 otherwise eligible model was excluded/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove price caps" }));
    await waitFor(() => expect(new URL(window.location.href).searchParams.has("input")).toBe(false));
    expect(screen.getByText(/4 models shown/)).toBeInTheDocument();
  });
});
