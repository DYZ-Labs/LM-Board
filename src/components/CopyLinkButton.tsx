"use client";

import { useEffect, useRef, useState } from "react";

import { AlertIcon, CheckIcon, LinkIcon } from "@/components/Icon";
import { toast } from "@/components/Toast";
import { trackEvent } from "@/lib/track";

type CopyLinkButtonProps = {
  /** Absolute or relative URL. Omit to copy the current view verbatim. */
  href?: string;
  label?: string;
  confirmation?: string;
  className?: string;
  /** Which copy affordance this is, for the conversion event. */
  surface: "view" | "row" | "record" | "comparison";
};

type Status = "idle" | "copying" | "copied" | "error";

/**
 * The conversion action. The URL that urlState.ts maintains is fully shareable —
 * including the active filters — it just had no affordance, so nobody knew to
 * copy it.
 */
export function CopyLinkButton({
  href,
  label = "Copy link",
  confirmation = "Link copied to clipboard",
  className = "btn",
  surface,
}: CopyLinkButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  function resetLater() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  async function copy() {
    // The write is asynchronous, so without this guard a double-click fires two
    // clipboard writes and stacks two toasts for one intent.
    if (status === "copying") return;

    const url = href
      ? new URL(href, window.location.href).toString()
      : window.location.href;

    setStatus("copying");

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      toast(confirmation);
      trackEvent("copy_link", { surface });
      resetLater();
    } catch {
      // Clipboard access is denied in some embedded and non-secure contexts.
      // Say so on the button as well as in the toast: the toast can be missed,
      // and the button is where the attention already is.
      setStatus("error");
      toast("Copying is blocked here — copy the address bar instead", "warn");
      resetLater();
    }
  }

  return (
    <button
      type="button"
      className={`${className}${status === "error" ? " is-error" : ""}`}
      onClick={copy}
      aria-disabled={status === "copying" || undefined}
    >
      {status === "copied" ? (
        <CheckIcon size={13} />
      ) : status === "error" ? (
        <AlertIcon size={13} />
      ) : (
        <LinkIcon />
      )}
      {label}
    </button>
  );
}
