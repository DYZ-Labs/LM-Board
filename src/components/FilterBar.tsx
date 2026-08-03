"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { CloseIcon, SearchIcon } from "@/components/Icon";
import type { ProviderSelection, ViewMode } from "@/lib/urlState";

const POPOVER_WIDTH = 320;
const POPOVER_GUTTER = 12;
const POPOVER_GAP = 6;

function clampPopover(details: HTMLDetailsElement | null) {
  const summary = details?.querySelector("summary");
  const popover = details?.querySelector<HTMLElement>(".popover");
  if (!details || !summary || !popover) return;

  const trigger = summary.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const width = Math.min(
    POPOVER_WIDTH,
    viewportWidth - POPOVER_GUTTER * 2,
  );
  const left = Math.min(
    viewportRight - POPOVER_GUTTER - width,
    Math.max(viewportLeft + POPOVER_GUTTER, trigger.left),
  );
  const offset = left - trigger.left;
  const availableBelow =
    viewportBottom - trigger.bottom - POPOVER_GAP - POPOVER_GUTTER;
  const availableAbove =
    trigger.top - viewportTop - POPOVER_GAP - POPOVER_GUTTER;
  const preferredHeight = Math.min(popover.scrollHeight || 520, 520);
  const placeAbove =
    availableBelow < preferredHeight && availableAbove > availableBelow;
  const availableBlock = Math.max(
    44,
    placeAbove ? availableAbove : availableBelow,
  );

  // The trigger can sit anywhere in the command row. Aligning only to its
  // start or end still leaves a viewport-width menu off-screen at 320–390px,
  // and a short landscape viewport can have more room above than below.
  // Publish both axes for CSS rather than guessing from a breakpoint.
  details.style.setProperty("--popover-inline-offset", `${offset}px`);
  details.style.setProperty(
    "--popover-available-block",
    `${availableBlock}px`,
  );
  details.dataset.popoverAlign = offset < 0 ? "end" : "start";
  details.dataset.popoverVertical = placeAbove ? "above" : "below";
}

type FilterBarProps = {
  labs: string[];
  selectedLabs: string[];
  providerFilterActive: boolean;
  query: string;
  openWeightsOnly: boolean;
  proprietaryWeightsOnly: boolean;
  resultCount: number;
  totalCount: number;
  view: ViewMode;
  onQueryChange: (query: string) => void;
  onQueryCommit: () => void;
  onQueryCancel: () => void;
  onToggleLab: (lab: string) => void;
  onSetLabs: (labs: ProviderSelection) => void;
  onOpenWeightsChange: (checked: boolean) => void;
  onProprietaryWeightsChange: (checked: boolean) => void;
  onFilterOpen: () => void;
  onFilterCommit: () => void;
  onFilterCancel: () => void;
  onClear: () => void;
  onViewChange: (view: ViewMode) => void;
};

type Chip = { key: string; label: string; remove: () => void };

export const FilterBar = memo(function FilterBar({
  labs,
  selectedLabs,
  providerFilterActive,
  query,
  openWeightsOnly,
  proprietaryWeightsOnly,
  resultCount,
  totalCount,
  onQueryChange,
  onQueryCommit,
  onQueryCancel,
  onToggleLab,
  onSetLabs,
  onOpenWeightsChange,
  onProprietaryWeightsChange,
  onFilterOpen,
  onFilterCommit,
  onFilterCancel,
  onClear,
}: FilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDetailsElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterOptionRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [activeFilterOption, setActiveFilterOption] = useState(0);
  const filterCloseIntentRef = useRef<
    "commit" | "cancel" | "history" | null
  >(null);
  const trimmedQuery = query.trim();
  const activeFilterCount =
    (providerFilterActive ? 1 : 0) +
    (openWeightsOnly ? 1 : 0) +
    (proprietaryWeightsOnly ? 1 : 0);
  const hasFilters = activeFilterCount > 0 || trimmedQuery.length > 0;

  function navigateFilterOptions(
    event: ReactKeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    const optionCount = labs.length + 2;
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = (index + 1) % optionCount;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        nextIndex = (index - 1 + optionCount) % optionCount;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = optionCount - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveFilterOption(nextIndex);
    filterOptionRefs.current[nextIndex]?.focus();
  }

  const closeFilters = useCallback(
    (
      intent: "commit" | "cancel" = "commit",
      restoreFocus = intent === "cancel",
    ) => {
      filterCloseIntentRef.current = intent;
      setFiltersOpen(false);
      if (restoreFocus) filtersRef.current?.querySelector("summary")?.focus();
    },
    [],
  );

  useEffect(() => {
    const host = filtersOpen ? filtersRef.current : null;
    if (!host) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !host?.contains(event.target)) {
        closeFilters("commit", false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeFilters("cancel");
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeFilters, filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) return;

    const alignOpenPopover = () => clampPopover(filtersRef.current);
    alignOpenPopover();
    window.addEventListener("resize", alignOpenPopover);
    window.addEventListener("scroll", alignOpenPopover, true);
    window.visualViewport?.addEventListener("resize", alignOpenPopover);
    window.visualViewport?.addEventListener("scroll", alignOpenPopover);
    return () => {
      window.removeEventListener("resize", alignOpenPopover);
      window.removeEventListener("scroll", alignOpenPopover, true);
      window.visualViewport?.removeEventListener("resize", alignOpenPopover);
      window.visualViewport?.removeEventListener("scroll", alignOpenPopover);
    };
  }, [filtersOpen]);

  useEffect(() => {
    function closeForHistory() {
      filterCloseIntentRef.current = "history";
      setFiltersOpen(false);
    }

    window.addEventListener("popstate", closeForHistory);
    return () => window.removeEventListener("popstate", closeForHistory);
  }, []);

  // The filter state is in the URL, so a shared link arrives with the board
  // already narrowed. Naming each filter is what makes that link explain
  // itself instead of looking like the whole dataset.
  const chips: Chip[] = [
    ...(trimmedQuery
      ? [
          {
            key: "q",
            label: `“${trimmedQuery}”`,
            remove: () => onQueryChange(""),
          },
        ]
      : []),
    ...(providerFilterActive
      ? selectedLabs.length === 0
        ? [
            {
              key: "providers-none",
              label: "No providers",
              remove: () => onSetLabs(null),
            },
          ]
        : selectedLabs.map((lab) => ({
            key: `lab-${lab}`,
            label: lab,
            remove: () => onToggleLab(lab),
          }))
      : []),
    ...(openWeightsOnly
      ? [
          {
            key: "open",
            label: "Open weights",
            remove: () => onOpenWeightsChange(false),
          },
        ]
      : []),
    ...(proprietaryWeightsOnly
      ? [
          {
            key: "proprietary",
            label: "Proprietary",
            remove: () => onProprietaryWeightsChange(false),
          },
        ]
      : []),
  ];

  return (
    <>
      <div className="command-row">
        <label className={`field search-field${query ? " has-value" : ""}`}>
          <span className="sr-only">Search models or providers</span>
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onBlur={onQueryCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") onQueryCommit();
              if (event.key === "Escape" && query) {
                event.preventDefault();
                onQueryCancel();
              }
            }}
            placeholder="Search models, e.g. GPT-5, Anthropic"
          />
          {query ? (
            <button
              type="button"
              className="field-clear"
              aria-label="Clear search"
              onClick={() => {
                onQueryChange("");
                onQueryCommit();
                searchRef.current?.focus();
              }}
            >
              <CloseIcon size={10} />
            </button>
          ) : null}
        </label>

        {/* One cluster, so the card layout's two-column grid places the field
            and every control beside it on one 44px row instead of two. */}
        <div className="row">
          <details
            className="disclosure"
            ref={filtersRef}
            open={filtersOpen}
            onToggle={(event) => {
              const nextOpen = event.currentTarget.open;
              if (nextOpen) clampPopover(event.currentTarget);
              setFiltersOpen(nextOpen);
              if (nextOpen) {
                setActiveFilterOption(0);
                filterCloseIntentRef.current = null;
                onFilterOpen();
                return;
              }

              const intent = filterCloseIntentRef.current ?? "commit";
              filterCloseIntentRef.current = null;
              if (intent === "commit") onFilterCommit();
              if (intent === "cancel") onFilterCancel();
            }}
          >
            <summary>
              Filters
              {activeFilterCount > 0 ? (
                <span className="count-pip">{activeFilterCount}</span>
              ) : null}
            </summary>
            <div className="popover">
              <div className="popover-head">
                <span className="menu-label">Provider</span>
                <button
                  type="button"
                  className="popover-link"
                  onClick={() => {
                    onSetLabs(
                      selectedLabs.length === labs.length ? [] : null,
                    );
                  }}
                >
                  {selectedLabs.length === labs.length ? "None" : "All"}
                </button>
              </div>
              <fieldset>
                <legend className="sr-only">Filter by provider</legend>
                {labs.map((lab, index) => {
                  const inputId = `provider-${index}`;

                  return (
                    <label className="check" key={lab} htmlFor={inputId}>
                      <input
                        ref={(node) => {
                          filterOptionRefs.current[index] = node;
                        }}
                        id={inputId}
                        type="checkbox"
                        tabIndex={activeFilterOption === index ? 0 : -1}
                        checked={selectedLabs.includes(lab)}
                        onFocus={() => setActiveFilterOption(index)}
                        onKeyDown={(event) =>
                          navigateFilterOptions(event, index)
                        }
                        onChange={() => onToggleLab(lab)}
                      />
                      <span>{lab}</span>
                    </label>
                  );
                })}
              </fieldset>
              <div className="popover-head">
                <span className="menu-label">Weights</span>
              </div>
              <label className="check">
                <input
                  ref={(node) => {
                    filterOptionRefs.current[labs.length] = node;
                  }}
                  type="checkbox"
                  tabIndex={activeFilterOption === labs.length ? 0 : -1}
                  checked={openWeightsOnly}
                  onFocus={() => setActiveFilterOption(labs.length)}
                  onKeyDown={(event) =>
                    navigateFilterOptions(event, labs.length)
                  }
                  onChange={(event) => onOpenWeightsChange(event.target.checked)}
                />
                <span>Open weights</span>
              </label>
              <label className="check">
                <input
                  ref={(node) => {
                    filterOptionRefs.current[labs.length + 1] = node;
                  }}
                  type="checkbox"
                  tabIndex={activeFilterOption === labs.length + 1 ? 0 : -1}
                  checked={proprietaryWeightsOnly}
                  onFocus={() => setActiveFilterOption(labs.length + 1)}
                  onKeyDown={(event) =>
                    navigateFilterOptions(event, labs.length + 1)
                  }
                  onChange={(event) =>
                    onProprietaryWeightsChange(event.target.checked)
                  }
                />
                <span>Proprietary</span>
              </label>
            </div>
          </details>

        </div>

        <div
          className="result-count"
          data-filtered={hasFilters}
          data-empty={resultCount === 0}
        >
          {resultCount} / {totalCount}
        </div>

        <CopyLinkButton
          surface="view"
          label="Copy view"
          confirmation="Link to this view copied"
        />
      </div>

      {chips.length > 0 ? (
        <div className="filter-chips">
          <span className="menu-label">Filtered by</span>
          {chips.map((chip) => (
            <span className="badge chip" key={chip.key}>
              {chip.label}
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove filter ${chip.label}`}
                onClick={chip.remove}
              >
                <CloseIcon size={9} />
              </button>
            </span>
          ))}
          <button type="button" className="chip-clear" onClick={onClear}>
            Clear all
          </button>
        </div>
      ) : null}
    </>
  );
});
