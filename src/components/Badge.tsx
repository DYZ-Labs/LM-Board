import type { ReactNode } from "react";

/** Badge colour derives from a semantic role, never from a caller-supplied class. */
export type BadgeTone = "neutral" | "warn" | "pos" | "signal";

const toneClass: Record<BadgeTone, string> = {
  neutral: "",
  warn: "badge-warn",
  pos: "badge-pos",
  signal: "badge-signal",
};

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
};

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: BadgeProps) {
  return (
    <span
      className={["badge", toneClass[tone], className].filter(Boolean).join(" ")}
      title={title}
    >
      {children}
    </span>
  );
}
