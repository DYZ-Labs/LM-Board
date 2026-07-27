import type { ReactNode } from "react";

/**
 * Badge colour derives from a semantic role, never from a caller-supplied
 * class. Three roles, because a fourth was never used and a page carrying four
 * chip treatments with no legend is not a system: neutral states a fact, warn
 * marks vendor-reported provenance, pos marks open weights.
 */
export type BadgeTone = "neutral" | "warn" | "pos";

const toneClass: Record<BadgeTone, string> = {
  neutral: "",
  warn: "badge-warn",
  pos: "badge-pos",
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
