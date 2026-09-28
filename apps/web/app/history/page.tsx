import Link from "next/link";
import { decisions } from "../../lib/data";
import { pretty } from "../ui/regime";
import { Shell } from "../ui/shell";
export default async function HistoryPage() {
  const rows = await decisions(250);
  return (
    <Shell current="history">
      <header className="page-head">
        <div>
          <span className="overline">Audit trail</span>
          <h1>Beslissingshistorie</h1>
          <p>
            Selecteer een snapshot om alle vier regimes, factoren, confidence en
            engineversie te reconstrueren.
          </p>
        </div>
      </header>
      <section className="panel">
        <div className="history-table">
          <div className="history-head">
            <span>Datum</span>
            <span>Asset</span>
            <span>M / C / R / A</span>
            <span>Decision</span>
            <span>Confidence</span>
            <span>Engine</span>
          </div>
          {rows.map((row) => (
            <Link
              href={`/assets/${row.symbol.toLowerCase()}?decision=${row.id}`}
              className="history-row"
              key={row.id}
            >
              <time>
                {new Intl.DateTimeFormat("nl-NL", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(row.calculated_at))}
              </time>
              <strong>{row.symbol}</strong>
              <span>
                {signed(row.macro_score)} / {signed(row.crypto_score)} /{" "}
                {signed(row.market_structure_score)} / {signed(row.asset_score)}
              </span>
              <span>
                {pretty(row.decision_state)}
                {row.risk_override !== "NONE" ? (
                  <small>{pretty(row.risk_override)}</small>
                ) : null}
              </span>
              <span
                className={`confidence ${row.confidence_level.toLowerCase()}`}
              >
                {row.confidence_level}
              </span>
              <code>{row.engine_version}</code>
            </Link>
          ))}
        </div>
        {!rows.length ? (
          <p className="muted">Nog geen historie beschikbaar.</p>
        ) : null}
      </section>
    </Shell>
  );
}
const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
