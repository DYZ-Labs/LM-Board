"use client";

import { useEffect, useRef, useState } from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { CloseIcon, SearchIcon } from "@/components/Icon";
import type { Density, ViewMode } from "@/lib/urlState";

const DENSITIES: { value: Density; label: string; title: string }[] = [
  { value: "comfortable", label: "Lg", title: "Comfortable rows" },
  { value: "compact", label: "Md", title: "Compact rows" },
  { value: "data", label: "Sm", title: "Data-dense rows" },
];

const VIEWS: { value: ViewMode; label: string; title: string }[] = [
  { value: "table", label: "Table", title: "All benchmark columns" },
  { value: "profile", label: "Profile", title: "Compact profile with a score spark" },
  { value: "plot", label: "Plot", title: "Price against Index" },
];

type FilterBarProps = {
  labs: string[];
  selectedLabs: string[];
  query: string;
  openWeightsOnly: boolean;
  resultCount: number;
  totalCount: number;
  view: ViewMode;
  density: Density;
  onQueryChange: (query: string) => void;
  onToggleLab: (lab: string) => void;
  onOpenWeightsChange: (checked: boolean) => void;
  onClear: () => void;
  onViewChange: (view: ViewMode) => void;
  onDensityChange: (density: Density) => void;
};

export function FilterBar({
  labs,
  selectedLabs,
  query,
  openWeightsOnly,
  resultCount,
  totalCount,
  view,
  density,
  onQueryChange,
  onToggleLab,
  onOpenWeightsChange,
  onClear,
  onViewChange,
  onDensityChange,
}: FilterBarProps) {
  const [providerOpen, setProviderOpen] = useState(false);
  const providerRef = useRef<HTMLDetailsElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const hasFilters =
    selectedLabs.length > 0 || openWeightsOnly || query.trim().length > 0;

  useEffect(() => {
    if (!providerOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !providerRef.current?.contains(event.target)
      ) {
        setProviderOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProviderOpen(false);
        providerRef.current?.querySelector("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [providerOpen]);

  return (
    <div className="command-row">
      <label className={`field${query ? " has-value" : ""}`}>
        <span className="sr-only">Search models or providers</span>
        <SearchIcon />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search models"
        />
        {query ? (
          <button
            type="button"
            className="field-clear"
            aria-label="Clear search"
            onClick={() => {
              onQueryChange("");
              searchRef.current?.focus();
            }}
          >
            <CloseIcon size={10} />
          </button>
        ) : null}
      </label>

      <details
        className="disclosure"
        ref={providerRef}
        open={providerOpen}
        onToggle={(event) => setProviderOpen(event.currentTarget.open)}
      >
        <summary>
          Providers
          {selectedLabs.length > 0 ? (
            <span className="count-pip">{selectedLabs.length}</span>
          ) : null}
        </summary>
        <div className="popover">
          <fieldset>
            <legend>Filter by provider</legend>
            {labs.map((lab, index) => {
              const inputId = `provider-${index}`;

              return (
                <label className="check" key={lab} htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={selectedLabs.includes(lab)}
                    onChange={() => onToggleLab(lab)}
                  />
                  <span>{lab}</span>
                </label>
              );
            })}
          </fieldset>
          <div className="popover-actions">
            {selectedLabs.length > 0 ? (
              <button
                type="button"
                className="btn"
                onClick={() => selectedLabs.forEach(onToggleLab)}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setProviderOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      </details>

      <label className="check">
        <input
          type="checkbox"
          checked={openWeightsOnly}
          onChange={(event) => onOpenWeightsChange(event.target.checked)}
        />
        <span>Open weights</span>
      </label>

      {hasFilters ? (
        <button type="button" className="btn" onClick={onClear}>
          Clear filters
        </button>
      ) : null}

      <div className="command-spacer" />

      <div className="result-count" aria-live="polite" aria-atomic="true">
        {resultCount} / {totalCount}
      </div>

      <div
        className="segmented"
        role="group"
        aria-label="Row density"
      >
        {DENSITIES.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-label={option.title}
            aria-pressed={density === option.value}
            onClick={() => onDensityChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="segmented" role="group" aria-label="Projection">
        {VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-label={option.title}
            aria-pressed={view === option.value}
            onClick={() => onViewChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <CopyLinkButton
        label="Copy view"
        confirmation="Link to this view copied"
      />
    </div>
  );
}
