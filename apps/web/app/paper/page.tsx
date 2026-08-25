import Link from "next/link";
import { paperWorkspace } from "../../lib/data";
import { Shell } from "../ui/shell";
import { PaperChart } from "./chart";
export default async function PaperPage() {
  const w = await paperWorkspace();
  if (!w.portfolio)
    return (
      <Shell current="paper">
        <header className="page-head">
          <div>
            <span className="overline">Prospective validation</span>
            <h1>Paperportfolio</h1>
          </div>
        </header>
        <section className="empty-state">
          <span>Nog niet gestart</span>
          <h2>Maak eerst je begeleide configuratie af</h2>
          <p>
            Daarmee worden een fictief cashsaldo, mandaat en bevroren
            paperprotocol aangemaakt.
          </p>
          <Link className="primary-action" href="/onboarding">
            Start configuratie
          </Link>
        </section>
      </Shell>
    );
  const latest = w.nav.at(-1) as Record<string, unknown> | undefined,
    initial = Number(w.portfolio.initial_capital),
    nav = Number(latest?.nav ?? initial),
    positions = (latest?.positions ?? {}) as Record<string, number>,
    cash = Number(latest?.cash ?? initial),
    metrics = (w.analytics?.metrics ?? {}) as Record<string, unknown>;
  return (
    <Shell current="paper">
      <header className="page-head">
        <div>
          <span className="overline">
            Alleen fictief · geen orderuitvoering
          </span>
          <h1>Paperportfolio</h1>
          <p>
            Volg beslissingen, fictieve fills, kosten en bewijs tegen vooraf
            vastgelegde benchmarks.
          </p>
        </div>
        <div className="asof">
          Protocol<strong>{w.portfolio.protocol_version}</strong>
        </div>
      </header>
      <nav className="paper-tabs">
        <a href="#portfolio">Portfolio</a>
        <a href="#decisions">Beslissingen</a>
        <a href="#results">Resultaten</a>
      </nav>
      <section id="portfolio" className="panel">
        <div className="panel-head">
          <h2>Fictieve posities</h2>
          <span>{w.portfolio.base_currency}</span>
        </div>
        <div className="paper-metrics">
          <div>
            <small>NAV</small>
            <strong>
              {nav.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}
            </strong>
          </div>
          <div>
            <small>Cash</small>
            <strong>
              {cash.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}
            </strong>
          </div>
          <div>
            <small>BTC</small>
            <strong>
              {Number(positions.BTC ?? 0).toLocaleString("nl-NL", {
                maximumFractionDigits: 6,
              })}
            </strong>
          </div>
          <div>
            <small>ETH</small>
            <strong>
              {Number(positions.ETH ?? 0).toLocaleString("nl-NL", {
                maximumFractionDigits: 5,
              })}
            </strong>
          </div>
        </div>
        <PaperChart
          rows={
            w.nav as Array<{
              calculated_at: string;
              nav: number;
              benchmark_nav: Record<string, number | null>;
            }>
          }
        />
      </section>
      <section id="decisions" className="panel mandate-benchmarks">
        <div className="panel-head">
          <div>
            <span className="overline">
              Recommendation → sign-off → fictieve fill
            </span>
            <h2>Paper trades</h2>
          </div>
          <span>{w.trades.length}</span>
        </div>
        {w.trades.map((t: Record<string, unknown>) => (
          <article className="journal-entry" key={String(t.id)}>
            <div>
              <span className="warning-badge">{String(t.side)}</span>
              <strong>
                {String(t.asset)} ·{" "}
                {Number(t.quantity).toLocaleString("nl-NL", {
                  maximumFractionDigits: 8,
                })}
              </strong>
              <time>
                {new Date(String(t.executed_at)).toLocaleString("nl-NL")}
              </time>
            </div>
            <p>
              Referentieprijs {Number(t.price).toLocaleString("nl-NL")} · fee{" "}
              {Number(t.fee).toFixed(2)} · slippage{" "}
              {Number(t.slippage).toFixed(2)}
            </p>
            <Link href={`/paper/trades/${t.id}`}>Volledige audit →</Link>
          </article>
        ))}
        {!w.trades.length && (
          <div className="empty-state">
            <span>Geen fictieve fills</span>
            <p>
              Een trade ontstaat pas na een beschikbare recommendation én jouw
              expliciete APPROVE-sign-off. Bekijk Beslissingen om te zien wat
              ontbreekt.
            </p>
            <Link href="/allocation">Naar beslissingen →</Link>
          </div>
        )}
      </section>
      <section id="results" className="panel mandate-benchmarks">
        <div className="panel-head">
          <h2>Prospectief bewijs</h2>
          <span>{String(metrics.sampleDays ?? 0)} meetdagen</span>
        </div>
        <div className="paper-metrics">
          <div>
            <small>Totaalrendement</small>
            <strong>
              {metrics.totalReturn == null
                ? "—"
                : `${(Number(metrics.totalReturn) * 100).toFixed(1)}%`}
            </strong>
          </div>
          <div>
            <small>Max drawdown</small>
            <strong>
              {metrics.maxDrawdown == null
                ? "—"
                : `${(Number(metrics.maxDrawdown) * 100).toFixed(1)}%`}
            </strong>
          </div>
          <div>
            <small>Turnover</small>
            <strong>
              {metrics.turnover == null
                ? "—"
                : `${(Number(metrics.turnover) * 100).toFixed(1)}%`}
            </strong>
          </div>
          <div>
            <small>Rapporten</small>
            <strong>{w.reports.length}</strong>
          </div>
        </div>
        <p className="validation-warning">
          Kleine samples zijn niet betrouwbaar. Promotie blijft geblokkeerd tot
          minimaal zes maanden prospective evidence en de operationele gates
          slagen.
        </p>
      </section>
    </Shell>
  );
}
