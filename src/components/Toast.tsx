"use client";

import { useEffect, useState } from "react";

import { AlertIcon, CheckIcon } from "@/components/Icon";

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

export function toast(message: string, tone: ToastTone = "pos") {
  const entry = { id: nextId++, message, tone };
  toasts = [...toasts, entry];
  emit();

  // Errors stay until dismissed by the next action; confirmations expire.
  if (tone === "pos") {
    setTimeout(() => {
      toasts = toasts.filter((item) => item.id !== entry.id);
      emit();
    }, AUTO_DISMISS_MS);
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
        </div>
      ))}
    </div>
  );
}
