"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

import type { CommandPalettePayload } from "@/lib/commandPalette";

type CommandPaletteModule = typeof import("@/components/CommandPalette");
let commandPaletteModule: Promise<CommandPaletteModule> | null = null;

function loadCommandPalette() {
  commandPaletteModule ??= import("@/components/CommandPalette");
  return commandPaletteModule;
}

const CommandPalette = lazy(
  async () => ({
    default: (await loadCommandPalette()).CommandPalette,
  }),
);

/**
 * Keeps the dialog implementation and palette.css off the wire until the
 * visitor actually asks for it. This tiny listener also retains the homepage
 * "/" shortcut while unloaded; focusing that existing search field must not
 * pay for a second search interface.
 */
export function DeferredCommandPalette({
  payload,
}: {
  payload?: CommandPalettePayload;
}) {
  const [requested, setRequested] = useState(false);
  const [remotePayload, setRemotePayload] =
    useState<CommandPalettePayload | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const payloadRequestRef = useRef<Promise<void> | null>(null);
  const resolvedPayload = payload ?? remotePayload;

  useEffect(() => {
    if (requested && resolvedPayload) return;

    function requestPalette() {
      setRequested(true);
      void loadCommandPalette();

      if (payload || remotePayload || payloadRequestRef.current) return;

      payloadRequestRef.current = fetch("/palette.json")
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Palette index returned ${response.status}`);
          }
          return response.json() as Promise<CommandPalettePayload>;
        })
        .then(setRemotePayload)
        .catch(() => {
          // Keep the shortcut retryable after an offline or interrupted
          // request. Navigation itself must remain unaffected.
          payloadRequestRef.current = null;
          setRequested(false);
        });
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const typingInField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        returnFocusRef.current = document.activeElement as HTMLElement;
        requestPalette();
        return;
      }

      if (event.key === "/" && !typingInField) {
        const field = document.querySelector<HTMLInputElement>(
          ".command-row .field input",
        );
        if (!field) return;

        event.preventDefault();
        field.focus();
        field.select();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [payload, remotePayload, requested, resolvedPayload]);

  if (!requested || !resolvedPayload) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette
        payload={resolvedPayload}
        initialOpen
        initialReturnFocus={returnFocusRef.current}
      />
    </Suspense>
  );
}
