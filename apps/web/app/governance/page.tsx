import { governanceWorkspace } from "../../lib/data";
import { Shell } from "../ui/shell";
type Gate = {
  code: string;
  allocation_approved: boolean;
  provider_name: string | null;
  automation_rights: string;
  historical_storage_rights: string;
  freshness: string;
};
type Method = {
  id: string;
  code: string;
  status: string;
  methodology_type: string;
  version: string;
  rationale: string;
};
type Rule = {
  id: string;
  indicator_code: string;
  discrepancy_threshold_percent: number;
  primary_provider: string;
  secondary_provider: string | null;
  failure_action: string;
};

export default async function GovernancePage() {
  const g = await governanceWorkspace();
  return (
    <Shell current="governance">
      <header className="page-head">
        <div>
          <span className="overline">Evidence & trust</span>
          <h1>Methodologie en broncontrole</h1>
          <p>
            Een technisch bereikbare API is niet automatisch toegestaan voor
            allocatie. Deze pagina toont de actieve fail-closed poort.
          </p>
        </div>
      </header>
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="overline">Allocation source gate</span>
            <h2>Bronnen die kapitaalverhoging mogen beïnvloeden</h2>
          </div>
        </div>
        {(g.health as Gate[]).map((x) => (
          <article className="journal-entry" key={x.code}>
            <div>
              <strong>{x.code}</strong>
              <span
                className={
                  x.allocation_approved ? "status-badge" : "warning-badge"
                }
              >
                {x.allocation_approved ? "APPROVED" : "BLOCKED"}
              </span>
            </div>
            <p>
              {x.provider_name} · rechten {x.automation_rights}/
              {x.historical_storage_rights} · {x.freshness}
            </p>
          </article>
        ))}
      </section>
      <section className="journal-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Methodology registry</h2>
          </div>
          {(g.methods as Method[]).map((x) => (
            <article className="journal-entry" key={x.id}>
              <div>
                <strong>{x.code}</strong>
                <span>{x.status}</span>
              </div>
              <p>
                {x.methodology_type} · {x.version}
              </p>
              <small>{x.rationale}</small>
            </article>
          ))}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Reconciliatieregels</h2>
          </div>
          {(g.rules as Rule[]).map((x) => (
            <article className="journal-entry" key={x.id}>
              <div>
                <strong>{x.indicator_code}</strong>
                <span>{x.discrepancy_threshold_percent}%</span>
              </div>
              <p>
                {x.primary_provider} ↔{" "}
                {x.secondary_provider ?? "geen secundaire bron"}
              </p>
              <small>{x.failure_action}</small>
            </article>
          ))}
        </section>
      </section>
    </Shell>
  );
}
