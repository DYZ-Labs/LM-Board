import axe from "axe-core";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ScatterPlot } from "@/components/ScatterPlot";
import { loadLeaderboardData } from "@/lib/data";
import {
  expandLeaderboardClientPayload,
  toLeaderboardClientPayload,
} from "@/lib/leaderboardPayload";
import { efficientFrontier, toPlotPayload } from "@/lib/visualization";

const rows = expandLeaderboardClientPayload(
  toLeaderboardClientPayload(loadLeaderboardData()),
).rows;

function frontierOf(scope: "overall" | "coding") {
  const priced = rows.filter(
    (row) => row.model.pricing != null && row.scopes[scope].index != null,
  );
  const ids = efficientFrontier(
    priced.map((row) => ({
      id: row.model.id,
      item: row,
      price: row.model.pricing!.input,
      index: row.scopes[scope].index!,
    })),
  );

  return priced
    .filter((row) => ids.has(row.model.id))
    .map((row) => row.model.name);
}

describe("ScatterPlot", () => {
  it("renders the compact single-scope payload used by /value", () => {
    const data = loadLeaderboardData();
    const { container } = render(
      <ScatterPlot
        payload={toPlotPayload(data.rows, "overall")}
        category="overall"
      />,
    );

    expect(container.querySelectorAll(".plot-mark").length).toBeGreaterThan(40);
    expect(container.querySelectorAll(".plot-data tbody tr")).toHaveLength(
      container.querySelectorAll(".plot-mark").length,
    );
  });

  it("labels the whole frontier, not a slice of it", () => {
    const { container } = render(
      <ScatterPlot rows={rows} category="overall" />,
    );
    const labelled = [...container.querySelectorAll(".plot-name")].map(
      (node) => node.firstChild?.textContent,
    );

    // The old component kept `frontier.slice(-6)`, which threw away the
    // cheapest points — exactly the half of the claim worth making.
    expect([...labelled].sort()).toEqual([...frontierOf("overall")].sort());
  });

  it("draws the frontier as a monotone staircase", () => {
    const { container } = render(
      <ScatterPlot rows={rows} category="overall" />,
    );
    const path = container.querySelector(".plot-front")!.getAttribute("d")!;
    const xs = [...path.matchAll(/[MH]([\d.]+)/g)].map((match) =>
      Number(match[1]),
    );
    // A step path only: prices never go backwards and the Index only ever
    // rises, so every vertical segment moves up the box.
    const ys = [...path.matchAll(/[V ](\d[\d.]*)/g)].map((match) =>
      Number(match[1]),
    );

    expect(xs.length).toBeGreaterThan(4);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect([...ys].sort((a, b) => b - a)).toEqual(ys);
  });

  it("encodes open weights by shape, never by hue alone", () => {
    const { container } = render(
      <ScatterPlot rows={rows} category="overall" />,
    );
    const open = container.querySelectorAll(".plot-mark.is-open");
    const plotted = container.querySelectorAll(".plot-mark");

    expect(open.length).toBeGreaterThan(0);
    expect(open.length).toBeLessThan(plotted.length);
  });

  it("uses one keyboard stop with named options and one selected record link", () => {
    const { container } = render(
      <ScatterPlot rows={rows} category="overall" />,
    );
    const plot = container.querySelector<HTMLElement>('[role="listbox"]')!;
    const marks = [...container.querySelectorAll('[role="option"]')];

    expect(marks.length).toBeGreaterThan(40);
    expect(plot.tabIndex).toBe(0);
    expect(plot.getAttribute("aria-activedescendant")).toMatch(/^plot-point-/);
    expect(container.querySelectorAll(".plot-inspector a")).toHaveLength(1);

    for (const mark of marks) {
      expect(mark.getAttribute("aria-label")).toMatch(
        /: Overall Index \d+\.\d, (?:free input|\$\d+\.\d+ per million input tokens)/,
      );
    }
  });

  it("numbers the y axis and gives the price axis a log signature", () => {
    const { container } = render(
      <ScatterPlot rows={rows} category="overall" />,
    );
    const yLabels = [...container.querySelectorAll(".plot-y")].map(
      (node) => node.textContent,
    );
    const xLabels = [...container.querySelectorAll(".plot-x")].map(
      (node) => node.textContent,
    );

    // Five gridlines and zero numbers was the defect.
    expect(yLabels.length).toBeGreaterThanOrEqual(3);
    expect(yLabels.every((label) => Number(label) % 10 === 0)).toBe(true);
    // The $0.14-$0.50 band used to carry no reference mark at all.
    expect(xLabels).toContain("$0.20");
    expect(xLabels).toContain("$0.50");
    expect(
      container.querySelectorAll(".plot-rules .is-stub").length,
    ).toBeGreaterThan(4);
  });

  it("keeps every plotted value in the table, out of the tab order", () => {
    const { container } = render(
      <ScatterPlot rows={rows} category="overall" />,
    );
    const marks = container.querySelectorAll(".plot-mark").length;
    const bodyRows = container.querySelectorAll(".plot-data tbody tr");

    expect(bodyRows).toHaveLength(marks);
  });

  it("survives a frontier with ties in price and in Index", () => {
    // Coding puts two models on $5.00 and two on the same Index; the
    // declutter pass has to place both without dropping either.
    const { container } = render(<ScatterPlot rows={rows} category="coding" />);
    const labelled = [...container.querySelectorAll(".plot-name")].map(
      (node) => node.firstChild?.textContent,
    );

    expect([...labelled].sort()).toEqual([...frontierOf("coding")].sort());
  });

  it("opens a shared point and keeps later selections in the URL", async () => {
    const requested = rows.find(
      (row) => row.model.pricing && row.scopes.overall.index !== null,
    )!;
    const replacement = rows.find(
      (row) =>
        row.model.id !== requested.model.id &&
        row.model.pricing &&
        row.scopes.overall.index !== null,
    )!;
    window.history.replaceState(
      {},
      "",
      `/value?point=${requested.model.id}&utm_source=test`,
    );

    try {
      const user = userEvent.setup();
      const { container, getByRole } = render(
        <ScatterPlot rows={rows} category="overall" syncPointToUrl />,
      );

      expect(
        getByRole("heading", { level: 3, name: requested.model.name }),
      ).toBeTruthy();
      await user.click(
        container.querySelector(`#plot-point-${replacement.model.id}`)!,
      );
      const url = new URL(window.location.href);
      expect(url.searchParams.get("point")).toBe(replacement.model.id);
      expect(url.searchParams.get("utm_source")).toBe("test");
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <h1>LM Board</h1>
        <ScatterPlot rows={rows} category="overall" />
      </main>,
    );
    const results = await axe.run(container, {
      rules: {
        "color-contrast": { enabled: false },
        region: { enabled: false },
      },
    });

    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  }, 30000);

  it("says so rather than drawing an empty frame when nothing can be plotted", () => {
    const { container, getByText } = render(
      <ScatterPlot rows={[]} category="overall" />,
    );

    expect(container.querySelector(".plot-area")).toBeNull();
    expect(getByText(/nothing to plot/)).toBeTruthy();
  });
});
