"use client";

import type { Benchmark } from "@/lib/schema";

export type Category = "overall" | Benchmark["category"];

const categories: { value: Category; label: string }[] = [
  { value: "overall", label: "Overall" },
  { value: "reasoning", label: "Reasoning" },
  { value: "coding", label: "Coding" },
  { value: "math", label: "Math" },
  { value: "agentic", label: "Agentic" },
];

type CategoryTabsProps = {
  value: Category;
  onChange: (category: Category) => void;
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
