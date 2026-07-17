"use client";

import { useEffect, useId, useRef, useState } from "react";

type TooltipProps = {
  label: string;
  description: string;
  meta: string;
  sourceUrl: string;
};

export function Tooltip({
  label,
  description,
  meta,
  sourceUrl,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      className="benchmark-tooltip"
      ref={containerRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!containerRef.current?.contains(document.activeElement)) {
          setOpen(false);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="tooltip-trigger"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
          <circle cx="8" cy="8" r="6.25" fill="none" />
          <path d="M8 7.1v4" />
          <circle cx="8" cy="4.8" r=".65" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <div
        id={panelId}
        className="tooltip-panel"
        role="dialog"
        aria-label={`${label} benchmark details`}
        hidden={!open}
      >
        <strong>{label}</strong>
        <p>{description}</p>
        <p className="tooltip-meta">{meta}</p>
        <a href={sourceUrl} target="_blank" rel="noreferrer">
          Benchmark source
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
