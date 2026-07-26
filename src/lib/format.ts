const priceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const subDollarPriceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const scoreFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const countFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatPrice(price: number) {
  return price < 1
    ? subDollarPriceFormatter.format(price)
    : priceFormatter.format(price);
}

export function formatScore(value: number) {
  return scoreFormatter.format(value);
}

export function formatCount(value: number) {
  return countFormatter.format(value);
}

export function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

/**
 * Whole days between an ISO date and now, in UTC. Positive means in the past.
 * Only ever called on the client: a build-time relative label would freeze at
 * "3 days ago" until the next deploy, which is exactly the kind of quiet
 * staleness a leaderboard cannot afford.
 */
export function daysSince(date: string, now: Date): number {
  const then = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return Math.round((today - then) / 86_400_000);
}

export function formatRelativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 61) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return "over a year ago";
}
