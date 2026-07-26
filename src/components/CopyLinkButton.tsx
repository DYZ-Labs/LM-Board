"use client";

import { useState } from "react";

import { CheckIcon, LinkIcon } from "@/components/Icon";
import { toast } from "@/components/Toast";

type CopyLinkButtonProps = {
  /** Absolute or relative URL. Omit to copy the current view verbatim. */
  href?: string;
  label?: string;
  confirmation?: string;
  className?: string;
};

/**
 * The conversion action. The URL that urlState.ts already maintains is fully
 * shareable — it just had no affordance, so nobody knew to copy it.
 */
export function CopyLinkButton({
  href,
  label = "Copy link",
  confirmation = "Link copied to clipboard",
  className = "btn",
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = href
      ? new URL(href, window.location.href).toString()
      : window.location.href;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast(confirmation);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some embedded and non-secure contexts.
      // Say so rather than failing silently.
      toast("Copying is blocked here — copy the address bar instead", "warn");
    }
  }

  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? <CheckIcon size={13} /> : <LinkIcon />}
      {label}
    </button>
  );
}
