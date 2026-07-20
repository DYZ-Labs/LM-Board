"use client";

import { useState } from "react";

import type { LeaderboardRow } from "@/lib/data";
import type { RankScope } from "@/lib/index";

export type SortDirection = "asc" | "desc";

export type SortColumn =
  | { kind: "rank" }
  | { kind: "model" }
  | { kind: "index" }
  | { kind: "price" }
  | { kind: "benchmark"; id: string };

export type SortState = {
  column: SortColumn;
  direction: SortDirection;
};

export const DEFAULT_SORT: SortState = {
  column: { kind: "index" },
  direction: "desc",
};

const nameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function columnsMatch(left: SortColumn, right: SortColumn) {
  return (
    left.kind === right.kind &&
    (left.kind !== "benchmark" ||
      (right.kind === "benchmark" && left.id === right.id))
  );
}

export function defaultDirectionFor(column: SortColumn): SortDirection {
  return column.kind === "model" ||
    column.kind === "price" ||
    column.kind === "rank"
    ? "asc"
    : "desc";
}

export function nextDirectionFor(
  current: SortState,
  column: SortColumn,
): SortDirection {
  if (!columnsMatch(current.column, column)) {
    return defaultDirectionFor(column);
  }

  return current.direction === "asc" ? "desc" : "asc";
}

export function isActiveSortColumn(state: SortState, column: SortColumn) {
  return columnsMatch(state.column, column);
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: SortDirection,
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const difference = left - right;
  return direction === "asc" ? difference : -difference;
}

export function sortLeaderboardRows(
  rows: readonly LeaderboardRow[],
  sort: SortState,
  scope: RankScope = "overall",
) {
  return [...rows].sort((left, right) => {
    let comparison = 0;

    switch (sort.column.kind) {
      case "rank":
        comparison = compareNullableNumbers(
          left.scopes[scope].rank,
          right.scopes[scope].rank,
          sort.direction,
        );
        break;
      case "model":
        comparison = nameCollator.compare(
          left.model.name,
          right.model.name,
        );
        if (sort.direction === "desc") comparison *= -1;
        break;
      case "index":
        comparison = compareNullableNumbers(
          left.scopes[scope].index,
          right.scopes[scope].index,
          sort.direction,
        );
        break;
      case "price": {
        comparison = compareNullableNumbers(
          left.model.pricing?.input ?? null,
          right.model.pricing?.input ?? null,
          sort.direction,
        );
        if (comparison === 0) {
          comparison = compareNullableNumbers(
            left.model.pricing?.output ?? null,
            right.model.pricing?.output ?? null,
            sort.direction,
          );
        }
        break;
      }
      case "benchmark":
        comparison = compareNullableNumbers(
          left.scoresByBenchmark[sort.column.id]?.value ?? null,
          right.scoresByBenchmark[sort.column.id]?.value ?? null,
          sort.direction,
        );
        break;
    }

    return (
      comparison ||
      nameCollator.compare(left.model.name, right.model.name) ||
      left.model.id.localeCompare(right.model.id)
    );
  });
}

export function useSort(initialSort: SortState = DEFAULT_SORT) {
  const [sort, setSort] = useState<SortState>(initialSort);

  function requestSort(column: SortColumn) {
    setSort((current) => ({
      column,
      direction: nextDirectionFor(current, column),
    }));
  }

  return { sort, setSort, requestSort };
}
