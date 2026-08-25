export function PaperChart({
  rows,
}: {
  rows: Array<{
    calculated_at: string;
    nav: number;
    benchmark_nav: Record<string, number | null>;
  }>;
}) {
  if (rows.length < 2)
    return (
      <div className="empty-state">
        <span>Nog onvoldoende meetpunten</span>
        <p>
          Na minimaal twee dagelijkse waarderingen verschijnt hier de NAV- en
          benchmarklijn.
        </p>
      </div>
    );
  const values = rows.flatMap((r) => [
      Number(r.nav),
      Number(r.benchmark_nav?.BTC_ETH_60_40 ?? r.nav),
    ]),
    min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1,
    points = (key: "nav" | "benchmark") =>
      rows
        .map(
          (r, i) =>
            `${(i / (rows.length - 1)) * 100},${95 - ((Number(key === "nav" ? r.nav : (r.benchmark_nav?.BTC_ETH_60_40 ?? r.nav)) - min) / range) * 85}`,
        )
        .join(" ");
  return (
    <div>
      <svg
        className="paper-chart"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Paper NAV vergeleken met statische BTC ETH benchmark"
      >
        <polyline points={points("benchmark")} className="benchmark" />
        <polyline points={points("nav")} />
      </svg>
      <p className="muted">
        Groen: paperstrategie · blauw gestreept: statisch 60/40 BTC/ETH ·
        identiek meetvenster
      </p>
    </div>
  );
}
