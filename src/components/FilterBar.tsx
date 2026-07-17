"use client";

import { useEffect, useRef, useState } from "react";

type FilterBarProps = {
  labs: string[];
  selectedLabs: string[];
  query: string;
  openWeightsOnly: boolean;
  resultCount: number;
  totalCount: number;
  onQueryChange: (query: string) => void;
  onToggleLab: (lab: string) => void;
  onOpenWeightsChange: (checked: boolean) => void;
  onClear: () => void;
};

export function FilterBar({
  labs,
  selectedLabs,
  query,
  openWeightsOnly,
  resultCount,
  totalCount,
  onQueryChange,
  onToggleLab,
  onOpenWeightsChange,
  onClear,
}: FilterBarProps) {
  const [providerOpen, setProviderOpen] = useState(false);
  const providerRef = useRef<HTMLDetailsElement>(null);
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
    <div className="filter-bar">
      <label className="search-control">
        <span className="sr-only">Search models or providers</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="16"
          height="16"
        >
          <circle cx="8.5" cy="8.5" r="5.75" fill="none" />
          <path d="m13 13 4 4" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search models"
        />
      </label>

      <details
        className="provider-filter"
        ref={providerRef}
        open={providerOpen}
        onToggle={(event) => setProviderOpen(event.currentTarget.open)}
      >
        <summary>
          Providers
          {selectedLabs.length > 0 ? (
            <span className="filter-count">{selectedLabs.length}</span>
          ) : null}
        </summary>
        <div className="provider-menu">
          <fieldset>
            <legend>Filter by provider</legend>
            {labs.map((lab, index) => {
              const inputId = `provider-${index}`;

              return (
                <label key={lab} htmlFor={inputId}>
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
          {selectedLabs.length > 0 ? (
            <button
              type="button"
              className="provider-clear"
              onClick={() => selectedLabs.forEach(onToggleLab)}
            >
              Clear providers
            </button>
          ) : null}
          <button
            type="button"
            className="provider-done"
            onClick={() => setProviderOpen(false)}
          >
            Done
          </button>
        </div>
      </details>

      <label className="toggle-control">
        <input
          type="checkbox"
          checked={openWeightsOnly}
          onChange={(event) => onOpenWeightsChange(event.target.checked)}
        />
        <span>Open weights only</span>
      </label>

      <div className="filter-result" aria-live="polite" aria-atomic="true">
        {resultCount} of {totalCount} models
      </div>

      {hasFilters ? (
        <button type="button" className="clear-filters" onClick={onClear}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
