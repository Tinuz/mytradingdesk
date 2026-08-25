import Link from "next/link";
import { notFound } from "next/navigation";
import { paperTradeAudit } from "../../../../lib/data";
import { Shell } from "../../../ui/shell";
export default async function PaperTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const trade = await paperTradeAudit((await params).id);
  if (!trade) notFound();
  const recommendation = trade.allocation_recommendations as Record<
      string,
      unknown
    >,
    signoffs = (recommendation.analyst_signoffs ?? []) as Array<
      Record<string, unknown>
    >;
  return (
    <Shell current="paper">
      <header className="page-head">
        <div>
          <Link href="/paper">← Paperportfolio</Link>
          <span className="overline">Immutable paper-trade audit</span>
          <h1>
            {trade.side} {trade.asset}
          </h1>
          <p>
            Van modelsnapshot via menselijk besluit naar een fictieve
            point-in-time fill.
          </p>
        </div>
      </header>
      <section className="panel audit-grid">
        <div>
          <small>Uitgevoerd</small>
          <strong>{new Date(trade.executed_at).toLocaleString("nl-NL")}</strong>
        </div>
        <div>
          <small>Hoeveelheid</small>
          <strong>{trade.quantity}</strong>
        </div>
        <div>
          <small>Referentieprijs</small>
          <strong>{trade.price}</strong>
        </div>
        <div>
          <small>Fee / slippage</small>
          <strong>
            {trade.fee} / {trade.slippage}
          </strong>
        </div>
        <div>
          <small>Execution rule</small>
          <strong>{trade.execution_rule}</strong>
        </div>
        <div>
          <small>Policy</small>
          <strong>{String(recommendation.allocation_policy_version)}</strong>
        </div>
      </section>
      <section className="journal-grid">
        <section className="panel">
          <h2>Oorspronkelijk modelresultaat</h2>
          <pre>
            {JSON.stringify(
              {
                calculatedAt: recommendation.calculated_at,
                status: recommendation.status,
                targetRanges: recommendation.target_ranges,
                constraints: recommendation.binding_constraints,
                warnings: recommendation.warnings,
              },
              null,
              2,
            )}
          </pre>
        </section>
        <section className="panel">
          <h2>Menselijke beoordeling</h2>
          {signoffs.map((x) => (
            <article className="journal-entry" key={String(x.id)}>
              <strong>{String(x.action)}</strong>
              <p>{String(x.rationale)}</p>
              <time>
                {new Date(String(x.created_at)).toLocaleString("nl-NL")}
              </time>
            </article>
          ))}
        </section>
      </section>
      <p className="validation-warning">
        Dit is een fictieve fill. Er is geen brokerorder, custodywijziging of
        echt kapitaal gebruikt.
      </p>
    </Shell>
  );
}
