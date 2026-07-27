import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FieldStrip } from "@/components/FieldStrip";
import { ModelRecord } from "@/components/ModelRecord";
import { rankScopeLabel, RANK_SCOPES } from "@/lib/categories";
import { loadLeaderboardData } from "@/lib/data";
import { formatScore } from "@/lib/format";

const data = loadLeaderboardData();
const leader = data.rows.find((row) => row.scopes.overall.rank === 1)!;
const last = [...data.rows]
  .filter((row) => row.scopes.overall.rank !== null)
  .sort((a, b) => b.scopes.overall.rank! - a.scopes.overall.rank!)[0]!;

function selfX(container: HTMLElement) {
  return Number(
    container
      .querySelector(".field-self")!
      .getAttribute("d")!
      .match(/M([\d.]+)/)![1],
  );
}

describe("FieldStrip", () => {
  it("summarizes the field as a quartile band and median", () => {
    const { container } = render(
      <dl>
        <div>
          <FieldStrip scope="overall" modelId={leader.model.id} />
        </div>
      </dl>,
    );

    expect(container.querySelector(".field-quartiles")).toBeTruthy();
    expect(container.querySelector(".field-median")).toBeTruthy();
    expect(container.querySelectorAll(".field-self")).toHaveLength(1);
  });

  it("puts rank 1 at the top of the domain and the last rank at the bottom", () => {
    const { container: first } = render(
      <dl>
        <div>
          <FieldStrip scope="overall" modelId={leader.model.id} />
        </div>
      </dl>,
    );
    const { container: worst } = render(
      <dl>
        <div>
          <FieldStrip scope="overall" modelId={last.model.id} />
        </div>
      </dl>,
    );

    expect(selfX(first)).toBeCloseTo(99, 0);
    expect(selfX(worst)).toBeCloseTo(1, 0);
  });

  it("labels the domain it draws against", () => {
    const { container, getByText } = render(
      <dl>
        <div>
          <FieldStrip scope="overall" modelId={leader.model.id} />
        </div>
      </dl>,
    );

    expect(container.querySelectorAll(".field-ends span")).toHaveLength(3);
    expect(getByText(/approximately the .* percentile/)).toBeTruthy();
  });
});

describe("ModelRecord standing", () => {
  it("prints the field a rank was measured against", () => {
    const { getAllByText } = render(
      <ModelRecord row={leader} benchmarks={data.benchmarks} />,
    );

    // `rank 3` alone is not a quotable fact: 3 of 58 and 3 of 4 differ.
    expect(
      getAllByText(`rank 1 of ${leader.scopes.overall.rankedFieldSize}`).length,
    ).toBeGreaterThan(0);
  });

  it("puts a mark in every ranked scope tile", () => {
    const { container } = render(
      <ModelRecord row={leader} benchmarks={data.benchmarks} />,
    );
    const ranked = container.querySelectorAll(".record-scope").length;

    expect(container.querySelectorAll(".field-strip")).toHaveLength(ranked);
  });

  it("maps every compact category value to its visible category label", () => {
    const { container } = render(
      <ModelRecord row={leader} benchmarks={data.benchmarks} />,
    );
    const summary = container.querySelector(".record-category-summary")!;
    const metrics = within(summary as HTMLElement).getAllByRole("listitem");
    const scopes = RANK_SCOPES.filter((scope) => scope !== "overall");

    expect(metrics).toHaveLength(scopes.length);
    for (const [index, scope] of scopes.entries()) {
      const value = leader.scopes[scope].index;
      expect(metrics[index]).toHaveTextContent(
        `${rankScopeLabel(scope)} ${value === null ? "—" : formatScore(value)}`,
      );
    }
  });

  it("keeps every record action in one labelled, discoverable navigation", () => {
    const { getByRole } = render(
      <ModelRecord row={leader} benchmarks={data.benchmarks} />,
    );
    const actions = within(
      getByRole("navigation", { name: "Model actions" }),
    );

    expect(actions.getByRole("link", { name: "Compare" })).toBeInTheDocument();
    expect(
      actions.getByRole("link", { name: /Provider page/ }),
    ).toBeInTheDocument();
    expect(
      actions.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
    expect(
      actions.getByRole("link", { name: "Leaderboard" }),
    ).toBeInTheDocument();
  });
});
