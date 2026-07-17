const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

type StatStripProps = {
  modelCount: number;
  benchmarkCount: number;
  lastUpdated: string;
};

export function StatStrip({
  modelCount,
  benchmarkCount,
  lastUpdated,
}: StatStripProps) {
  return (
    <dl className="stat-strip" aria-label="Dataset summary">
      <div>
        <dt>Models tracked</dt>
        <dd>{modelCount}</dd>
      </div>
      <div>
        <dt>Benchmarks</dt>
        <dd>{benchmarkCount}</dd>
      </div>
      <div>
        <dt>Last updated</dt>
        <dd>
          <time dateTime={lastUpdated}>{formatDate(lastUpdated)}</time>
        </dd>
      </div>
    </dl>
  );
}
