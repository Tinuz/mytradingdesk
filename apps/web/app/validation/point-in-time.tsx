import { pointInTimeAudit } from "../../lib/data";
type IndicatorResult = {
  availability_basis: string;
  minimum_history: number;
  total_observations: number;
  same_day_available: number;
  late_observations: number;
  missing_availability: number;
  point_in_time_status: string;
  blockers: string[];
  indicators: { code?: string } | null;
};
export async function PointInTimeGate() {
  const { audit, indicators } = await pointInTimeAudit();
  if (!audit)
    return (
      <section className="empty-state">
        <span>Gate 2 niet geaudit</span>
        <p>
          Voer <code>npm run validation:audit-point-in-time</code> uit.
        </p>
      </section>
    );
  return (
    <section className="panel pit-gate">
      <div className="panel-head">
        <div>
          <span className="overline">Gate 2 / availability proof</span>
          <h2>Point-in-time integrity</h2>
        </div>
        <span
          className={
            audit.status === "PASSED" ? "fresh-badge" : "warning-badge"
          }
        >
          {audit.status}
        </span>
      </div>
      <p className="muted">{audit.summary.note}</p>
      <div className="metric-pair">
        <div>
          <small>Indicatoren met bewijs</small>
          <strong>
            {audit.passed_indicators}/{audit.required_indicators}
          </strong>
        </div>
        <div>
          <small>Prospectief venster</small>
          <strong>
            {audit.summary.prospectiveDays}/
            {audit.summary.requiredProspectiveDays} dagen
          </strong>
        </div>
      </div>
      <div className="health-table pit-table">
        <div className="health-head">
          <span>Indicator</span>
          <span>Basis</span>
          <span>Historie</span>
          <span>Late backfill</span>
          <span>Status</span>
        </div>
        {(indicators as unknown as IndicatorResult[]).map((row) => (
          <div className="health-row" key={row.indicators?.code}>
            <span>
              <strong>{row.indicators?.code}</strong>
              <small>
                {row.blockers.join(" · ") || "Availability bewezen"}
              </small>
            </span>
            <span>{row.availability_basis}</span>
            <span>
              {row.same_day_available}/{row.minimum_history}
            </span>
            <span>
              {row.late_observations}/{row.total_observations}
            </span>
            <span
              className={
                row.point_in_time_status === "PASSED"
                  ? "fresh-badge"
                  : "warning-badge"
              }
            >
              {row.point_in_time_status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
