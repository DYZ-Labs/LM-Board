"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ExternalIcon, InfoIcon } from "@/components/Icon";

const HOVER_INTENT_MS = 240;
const PANEL_WIDTH = 280;
const EDGE_GUTTER = 12;

type TooltipProps = {
  label: string;
  description: ReactNode;
  meta?: ReactNode;
  sourceUrl?: string;
  sourceLabel?: string;
  /** Replaces the default info icon — used for inline text triggers. */
  triggerContent?: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
};

/**
 * A disclosure, not a dialog. The previous implementation set role="dialog"
 * and aria-haspopup="dialog" on a control that opens on mouseenter, which some
 * screen readers announce as a modal.
 *
 * The panel is portalled into <body> so it is never clipped by the board's
 * scroll container, and it stays hoverable and dismissible per WCAG 1.4.13.
 */
export function Tooltip({
  label,
  description,
  meta,
  sourceUrl,
  sourceLabel = "Benchmark source",
  triggerContent,
  triggerClassName = "tooltip-trigger",
  triggerLabel,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bridgedRef = useRef(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setMounted(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const maxLeft = window.innerWidth - PANEL_WIDTH - EDGE_GUTTER;
    const left = Math.min(
      Math.max(EDGE_GUTTER, rect.left + rect.width / 2 - PANEL_WIDTH / 2),
      Math.max(EDGE_GUTTER, maxLeft),
    );
    const panelHeight = panelRef.current?.offsetHeight ?? 200;
    const below = rect.bottom + 8;
    // Flip above the trigger when the panel would run off the bottom.
    const top =
      below + panelHeight > window.innerHeight - EDGE_GUTTER
        ? Math.max(EDGE_GUTTER, rect.top - panelHeight - 8)
        : below;

    setPosition({ top, left });
  }, []);

  function cancelIntent() {
    if (intentTimer.current) {
      clearTimeout(intentTimer.current);
      intentTimer.current = null;
    }
  }

  function focusableStops(): HTMLElement[] {
    return Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("a[href], button") ?? [],
    );
  }

  function openNow() {
    cancelIntent();
    place();
    setOpen(true);
  }

  function openWithIntent() {
    cancelIntent();
    intentTimer.current = setTimeout(openNow, HOVER_INTENT_MS);
  }

  function closeNow() {
    cancelIntent();
    bridgedRef.current = false;
    setOpen(false);
  }

  useEffect(() => cancelIntent, []);

  useEffect(() => {
    if (!open) return;

    place();

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (
        hostRef.current?.contains(event.target) ||
        panelRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    // The panel is fixed to the viewport, so any scroll moves it off its
    // trigger. Reposition rather than close: closing on scroll makes the
    // content impossible to read on a touch device.
    const reposition = () => place();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, place]);

  /**
   * The panel is portalled to the end of <body> so the board's clipped scroll
   * container cannot cut it in half, which puts it after every other control
   * in tab order: measured, one Tab from the trigger landed on the next sort
   * button and closed the panel. Nine of ten panels carry the source link that
   * is this product's whole claim, so Tab is bridged across the portal by hand.
   */
  const panel = (
    <div
      id={panelId}
      ref={panelRef}
      className="tooltip-panel"
      hidden={!open}
      style={{ top: position.top, left: position.left }}
      onMouseEnter={cancelIntent}
      onMouseLeave={closeNow}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;

        const stops = focusableStops();
        const atEdge = event.shiftKey
          ? event.target === stops[0]
          : event.target === stops[stops.length - 1];
        if (!atEdge) return;

        event.preventDefault();
        // Marks the panel as visited so the next Tab off the trigger leaves
        // instead of bouncing straight back in.
        bridgedRef.current = !event.shiftKey;
        triggerRef.current?.focus();
      }}
    >
      <strong>{label}</strong>
      <p>{description}</p>
      {meta ? <p className="tooltip-meta">{meta}</p> : null}
      {sourceUrl ? (
        <a
          className="link-external"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {sourceLabel} <ExternalIcon className="ext" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );

  return (
    <div
      className="tooltip-host"
      ref={hostRef}
      onMouseEnter={openWithIntent}
      onMouseLeave={() => {
        cancelIntent();
        if (!hostRef.current?.contains(document.activeElement)) {
          closeNow();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel ?? `About ${label}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? closeNow() : openNow())}
        onFocus={(event) => {
          // Focus returning from the panel must not re-open it, or Escape —
          // which restores focus here — would immediately undo itself.
          if (panelRef.current?.contains(event.relatedTarget)) return;
          openNow();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab" || event.shiftKey || !open) return;

          if (bridgedRef.current) {
            bridgedRef.current = false;
            return;
          }

          const first = focusableStops()[0];
          if (!first) return;

          event.preventDefault();
          first.focus();
        }}
        onBlur={(event) => {
          if (!panelRef.current?.contains(event.relatedTarget)) {
            bridgedRef.current = false;
            closeNow();
          }
        }}
      >
        {triggerContent ?? <InfoIcon />}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </div>
  );
}
