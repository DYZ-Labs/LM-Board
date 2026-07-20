"use client";

import type { RankScope } from "@/lib/index";

export type { RankScope as Category } from "@/lib/index";

const categories: { value: RankScope; label: string }[] = [
  { value: "overall", label: "Overall" },
  { value: "reasoning", label: "Reasoning" },
  { value: "coding", label: "Coding" },
  { value: "math", label: "Math" },
  { value: "agentic", label: "Agentic" },
];

type CategoryTabsProps = {
  value: RankScope;
  onChange: (category: RankScope) => void;
};

export function CategoryTabs({ value, onChange }: CategoryTabsProps) {
  return (
    <div
      className="category-tabs"
      role="group"
      aria-label="Benchmark category"
    >
      {categories.map((category) => (
        <button
          key={category.value}
          type="button"
          className="category-tab"
          aria-pressed={value === category.value}
          onClick={() => onChange(category.value)}
        >
          {category.label}
        </button>
      ))}
    </div>
  );
}
