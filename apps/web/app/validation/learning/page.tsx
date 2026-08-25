import Link from "next/link";
import { validationLearningWorkspace } from "../../../lib/data";
import { Shell } from "../../ui/shell";
export default async function LearningPage() {
  const w = await validationLearningWorkspace(),
    byHorizon = new Map<number, Array<Record<string, unknown>>>();
  for (const h of [1, 7, 30, 90, 180]) {
    const candidates = (w.outcomes as Array<Record<string, unknown>>)
        .filter((row) => Number(row.horizon_days) === h)
        .sort((a, b) => {
          const at = String(
              (a.allocation_recommendations as { calculated_at?: string })
                ?.calculated_at ?? "",
            ),
            bt = String(
              (b.allocation_recommendations as { calculated_at?: string })
                ?.calculated_at ?? "",
            );
          return at.localeCompare(bt);
        }),
      independent: Array<Record<string, unknown>> = [];
    let lastIncluded = 0;
    for (const row of candidates) {
      const timestamp = new Date(
        String(
          (row.allocation_recommendations as { calculated_at?: string })
            ?.calculated_at,
        ),
      ).getTime();
      if (!Number.isFinite(timestamp)) continue;
      if (!lastIncluded || timestamp - lastIncluded >= h * 86_400_000) {
        independent.push(row);
        lastIncluded = timestamp;
      }
    }
    byHorizon.set(h, independent);
  }
  const overrides = (w.outcomes as Array<Record<string, unknown>>).filter((x) =>
    (
      (
        x.allocation_recommendations as {
          analyst_signoffs?: Array<{ action: string }>;
        }
      )?.analyst_signoffs ?? []
    ).some((s) => s.action === "MODIFY"),
  );
  return (
    <Shell current="validation">
      <header className="page-head">
        <div>
          <Link href="/validation">← Validatie</Link>
          <span className="overline">Prospective learning</span>
          <h1>Beslissingskwaliteit</h1>
          <p>
            Outcomes per vooraf vastgelegde horizon, menselijke overrides en
            maandelijkse procesrapporten.
          </p>
        </div>
      </header>
      <section className="panel">
        <div className="panel-head">
          <h2>Calibratie per horizon</h2>
          <span>niet-overlappende samples</span>
        </div>
        <div className="paper-metrics">
          {[1, 7, 30, 90, 180].map((h) => {
            const rows = byHorizon.get(h) ?? [],
              positive = rows.filter(
                (x) => Number(x.portfolio_return_percent) > 0,
              ).length,
              mean = rows.length
                ? rows.reduce(
                    (s, x) => s + Number(x.portfolio_return_percent),
                    0,
                  ) / rows.length
                : null;
            return (
              <div key={h}>
                <small>{h} dagen</small>
                <strong>{rows.length} samples</strong>
                <span>
                  {mean === null
                    ? "onvoldoende data"
                    : `${((positive / rows.length) * 100).toFixed(0)}% positief · gem. ${mean.toFixed(1)}%`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="validation-warning">
          Een positief aandeel is geen kansvoorspelling. Promotie is verboden
          bij onvoldoende sample en vereist walk-forward review.
        </p>
      </section>
      <section className="journal-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Menselijke overrides</h2>
            <span>{overrides.length}</span>
          </div>
          {overrides.map((x) => (
            <article className="journal-entry" key={String(x.id)}>
              <strong>
                {String(x.horizon_days)}d · resultaat{" "}
                {Number(x.portfolio_return_percent).toFixed(1)}%
              </strong>
              <p>
                Benchmark {Number(x.benchmark_return_percent).toFixed(1)}% ·
                adverse excursion{" "}
                {Number(x.adverse_excursion_percent).toFixed(1)}%
              </p>
            </article>
          ))}
          {!overrides.length && (
            <p className="muted">
              Nog geen MODIFY-beslissingen met volwassen outcome.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Maandrapporten</h2>
            <span>{w.reports.length}</span>
          </div>
          {(w.reports as Array<Record<string, unknown>>).map((x) => (
            <article className="journal-entry" key={String(x.id)}>
              <strong>{String(x.report_month)}</strong>
              <p>
                {String(
                  (x.decision_metrics as Record<string, unknown>)
                    ?.recommendations ?? 0,
                )}{" "}
                recommendations · operationele success rate{" "}
                {String(
                  (x.operational_metrics as Record<string, unknown>)
                    ?.successRate ?? "—",
                )}
              </p>
            </article>
          ))}
          {!w.reports.length && (
            <p className="muted">
              Het eerste rapport ontstaat na de eerste volledige kalendermaand.
            </p>
          )}
        </section>
      </section>
    </Shell>
  );
}
