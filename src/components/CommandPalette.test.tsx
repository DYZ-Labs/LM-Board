import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  buildPaletteEntries,
} from "@/components/CommandPalette";
import { DeferredCommandPalette } from "@/components/DeferredCommandPalette";
import { Methodology } from "@/components/Methodology";
import { toCommandPalettePayload } from "@/lib/commandPalette";
import { loadLeaderboardData } from "@/lib/data";
import { coverageThreshold } from "@/lib/index";

const data = loadLeaderboardData();
const payload = toCommandPalettePayload(data.rows, data.benchmarks);
const { minimumCoverageCount, percentBenchmarkCount } = coverageThreshold(
  data.benchmarks,
);

describe("command palette destinations", () => {
  it("targets a stable, existing methodology anchor for every benchmark", () => {
    const { container } = render(
      <Methodology
        benchmarks={data.benchmarks}
        percentBenchmarkCount={percentBenchmarkCount}
        minimumCoverageCount={minimumCoverageCount}
        issuesUrl={null}
      />,
    );
    const entries = buildPaletteEntries(payload);

    for (const benchmark of data.benchmarks) {
      const entry = entries.find(
        (candidate) => candidate.id === `bench-${benchmark.id}`,
      );

      expect(entry?.href).toBe(
        `/methodology#benchmark-${benchmark.id}`,
      );
      expect(
        container.querySelector(`#benchmark-${benchmark.id}`),
      ).not.toBeNull();
    }
  });

  it("offers the dedicated Value surface", () => {
    const entries = buildPaletteEntries(payload);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "view-value",
          href: "/value",
          detail: "Price versus performance",
        }),
      ]),
    );
  });
});

describe("deferred command palette", () => {
  it("loads on the first Cmd/Ctrl-K request, opens, and restores focus", async () => {
    render(
      <>
        <button type="button">Origin</button>
        <DeferredCommandPalette payload={payload} />
      </>,
    );
    const origin = screen.getByRole("button", { name: "Origin" });
    origin.focus();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(
      await screen.findByRole("dialog", { name: "Search LM Board" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", {
          name: "Search models, benchmarks and views",
        }),
      ).toHaveFocus();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(origin).toHaveFocus();
  });

  it("keeps slash focused on the homepage search without opening the palette", () => {
    render(
      <>
        <div className="command-row">
          <label className="field">
            <span>Models</span>
            <input defaultValue="existing" />
          </label>
        </div>
        <DeferredCommandPalette payload={payload} />
      </>,
    );
    const search = screen.getByRole("textbox", { name: "Models" });

    fireEvent.keyDown(document, { key: "/" });

    expect(search).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fetches the compact index only after a document-route shortcut", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json" },
        }),
      );

    try {
      render(<DeferredCommandPalette />);

      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.keyDown(document, { key: "k", metaKey: true });

      expect(
        await screen.findByRole("dialog", { name: "Search LM Board" }),
      ).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/palette.json");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
