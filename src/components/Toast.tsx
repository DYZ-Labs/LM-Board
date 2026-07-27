"use client";

import { useEffect, useState } from "react";

import { AlertIcon, CheckIcon, CloseIcon } from "@/components/Icon";

export type ToastTone = "pos" | "warn";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

const AUTO_DISMISS_MS = 4000;

// A module-level store rather than context: toasts are fired from leaf
// components that have no reason to know about a provider, and the whole
// surface is one region rendered once per page.
let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<(value: Toast[]) => void>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function dismiss(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

export function toast(message: string, tone: ToastTone = "pos") {
  const entry = { id: nextId++, message, tone };
  toasts = [...toasts, entry];
  emit();

  // Confirmations expire on their own; errors wait to be read. An error that
  // waits must still be closable, or it sits over the board for the rest of the
  // session — see the dismiss control below.
  if (tone === "pos") {
    setTimeout(() => dismiss(entry.id), AUTO_DISMISS_MS);
  }
}

export function ToastRegion() {
  const [items, setItems] = useState<Toast[]>(toasts);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  // Escape clears whatever is showing, so a persistent error never needs the
  // mouse. Bound only while something is up.
  useEffect(() => {
    if (items.length === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      toasts = [];
      emit();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [items.length]);

  return (
    <div
      className="toast-region"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.tone}`}>
          {item.tone === "pos" ? <CheckIcon /> : <AlertIcon />}
          <span>{item.message}</span>
          {/* Only the persistent tone needs a control; adding one to a
              confirmation that vanishes in 4s is a button nobody can hit. */}
          {item.tone === "warn" ? (
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss message"
              onClick={() => dismiss(item.id)}
            >
              <CloseIcon size={11} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
