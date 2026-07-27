"use client";

import { useEffect, useState } from "react";

import { daysSince, formatDate, formatRelativeDays } from "@/lib/format";

const STALE_AFTER_DAYS = 21;

type FreshnessChipProps = {
  date: string;
};

/**
 * Renders the absolute date on the server and upgrades to a relative label
 * after mount. Computing "3 days ago" at build time would freeze that string
 * until the next deploy; rendering the absolute date first also means there is
 * no hydration mismatch to suppress.
 */
export function FreshnessChip({ date }: FreshnessChipProps) {
  const [relative, setRelative] = useState<{ label: string; days: number } | null>(
    null,
  );

  useEffect(() => {
    const days = daysSince(date, new Date());
    setRelative({ label: formatRelativeDays(days), days });
  }, [date]);

  const isStale = relative !== null && relative.days > STALE_AFTER_DAYS;

  return (
    <span className={`freshness${isStale ? " is-stale" : ""}`}>
      <span className="live-dot" aria-hidden="true" />
      {/* "Updated" read as "the board was refreshed", which is a claim about
          all 456 scores when it is only true of the newest one. */}
      <span>
        Newest score{" "}
        <time dateTime={date} title={formatDate(date)}>
          {relative?.label ?? formatDate(date)}
        </time>
      </span>
    </span>
  );
}
