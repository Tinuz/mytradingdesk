import Link from "next/link";
import { notFound } from "next/navigation";
import {
  dashboardHistory,
  assetDecisionPacket,
  decision,
  decisions,
  type DecisionView,
  type Factor,
  type FactorBreakdown,
} from "../../../lib/data";
import { AssetDetailChart, RegimeTimeline } from "../../dashboard/visuals";
import { FactorTable, RegimeStrip, pretty, score, tone } from "../../ui/regime";
import { Shell } from "../../ui/shell";

const allFactors = (item: DecisionView) => [
  ...item.macro_factors.factors,
  ...item.crypto_factors.factors,
  ...item.market_structure_factors.factors,
  ...item.asset_factors.factors,
];
const label = (code: string) => code.replaceAll("_", " ");

function FactorBars({ breakdown }: { breakdown: FactorBreakdown }) {
  const factors = breakdown.factors.filter((factor) => factor.score !== null);
  const supportive = factors
    .filter((factor) => factor.score! > 0)
    .sort((a, b) => b.score! - a.score!);
  const risk = factors
    .filter((factor) => factor.score! < 0)
    .sort((a, b) => a.score! - b.score!);
  const group = (title: string, values: Factor[], kind: "support" | "risk") => (
    <div className={`factor-bar-group ${kind}`}>
      <h3>{title}</h3>
      {values.map((factor) => (
        <div className="factor-bar" key={factor.code}>
          <div>
            <strong>{label(factor.code)}</strong>
            <small>
              {pretty(factor.family)} · modelbijdrage, geen probability
            </small>
          </div>
          <i>
            <b
              style={{
                width: `${Math.max(16, Math.abs(factor.score ?? 0) * 45)}%`,
              }}
            />
          </i>
          <span>{score(factor.score)}</span>
        </div>
      ))}
      {!values.length && (
        <p className="muted">Geen factoren in deze richting.</p>
      )}
    </div>
  );
  return (
    <div className="factor-bars">
      {group("Supportive", supportive, "support")}
      {group("Risk", risk, "risk")}
    </div>
  );
}

function WhatChanged({
  item,
  previous,
}: {
  item: DecisionView;
  previous?: DecisionView | undefined;
}) {
  const before = new Map(
    (previous ? allFactors(previous) : []).map((factor) => [
      factor.code,
      factor.score ?? 0,
    ]),
  );
  const changes = allFactors(item)
    .filter(
      (factor, index, list) =>
        list.findIndex((candidate) => candidate.code === factor.code) === index,
    )
    .map((factor) => ({
      ...factor,
      delta:
        (factor.score ?? 0) - (before.get(factor.code) ?? factor.score ?? 0),
    }))
    .sort(
      (a, b) =>
        Math.abs(b.delta) - Math.abs(a.delta) ||
        Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0),
    )
    .slice(0, 8);
  return (
    <section className="panel asset-changes">
      <div className="panel-head">
        <div>
          <span className="overline">What changed?</span>
          <h2>Nieuw sinds vorige snapshot</h2>
        </div>
        <span>{previous ? "live vergelijking" : "geen eerdere snapshot"}</span>
      </div>
      {changes.map((factor) => (
        <div className="asset-change-row" key={factor.code}>
          <span
            className={
              factor.delta > 0
                ? "positive"
                : factor.delta < 0
                  ? "negative"
                  : "neutral"
            }
          >
            {factor.delta > 0 ? "↑" : factor.delta < 0 ? "↓" : "→"}
          </span>
          <div>
            <strong>{label(factor.code)}</strong>
            <small>
              {factor.delta === 0
                ? "STABLE"
                : factor.delta > 0
                  ? "IMPROVING"
                  : "DETERIORATING"}
            </small>
          </div>
          <em>{score(factor.score)}</em>
        </div>
      ))}
    </section>
  );
}

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ decision?: string | string[] }>;
}) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  if (symbol !== "BTC" && symbol !== "ETH") notFound();
  const selected = (await searchParams).decision;
  const selectedId = Array.isArray(selected) ? selected[0] : selected;
  const [history, replay, packet] = await Promise.all([
    decisions(100),
    dashboardHistory(),
    assetDecisionPacket(symbol),
  ]);
  const item = selectedId
    ? await decision(selectedId)
    : history.find((row) => row.symbol === symbol);
  if (!item || item.symbol !== symbol)
    return (
      <Shell current="dashboard">
        <div className="empty-state">
          <h1>Geen snapshot voor {symbol}</h1>
          <Link href="/dashboard">Terug naar overzicht</Link>
        </div>
      </Shell>
    );
  const previous = history.find(
    (row) =>
      row.symbol === symbol &&
      row.id !== item.id &&
      new Date(row.calculated_at) < new Date(item.calculated_at),
  );
  const visibleReplay = selectedId
    ? replay.filter(
        (point) =>
          Date.parse(point.evaluation_date) <=
          new Date(item.calculated_at).getTime(),
      )
    : replay;
  const supportive = allFactors(item)
    .filter((factor) => (factor.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const risks = allFactors(item)
    .filter((factor) => (factor.score ?? 0) < 0)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  return (
    <Shell current="dashboard">
      <header className="asset-hero">
        <Link
          href={selectedId ? "/history" : "/dashboard"}
          className="back-link"
        >
          ← {selectedId ? "Historie" : "Overzicht"}
        </Link>
        <div className="asset-identity">
          <span className={`coin large ${symbol.toLowerCase()}`}>
            {symbol === "BTC" ? "₿" : "Ξ"}
          </span>
          <div>
            <span className="overline">
              Asset intelligence / {symbol}
              {selectedId ? " / historical snapshot" : ""}
            </span>
            <h1>{item.asset_name}</h1>
            <p className="asset-interpretation">
              {supportive.length
                ? `${label(supportive[0]!.code)} ondersteunt het huidige beeld.`
                : "Er is geen sterke positieve factor."}{" "}
              {risks.length
                ? `${label(risks[0]!.code)} is het belangrijkste tegensignaal.`
                : "Geen negatieve factor is momenteel actief."}
            </p>
          </div>
        </div>
        <div className={`hero-decision ${tone(item.asset_score)}`}>
          <span>{selectedId ? "Historical" : "Current"} decision</span>
          <strong>{pretty(item.decision_state)}</strong>
          <small>
            {item.confidence_level} confidence · {item.engine_version}
          </small>
          {item.risk_override !== "NONE" ? (
            <em>{pretty(item.risk_override)}</em>
          ) : null}
        </div>
      </header>
      <AssetDetailChart symbol={symbol} points={visibleReplay} />
      <section className="journal-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="overline">Decision packet</span>
              <h2>Waardering en scenario</h2>
            </div>
            <span>
              {String(packet.valuation?.evidence_status ?? "MISSING")}
            </span>
          </div>
          {packet.valuation ? (
            <div className="horizon-grid">
              <div>
                <small>Fair-value band</small>
                <strong>
                  {Number(packet.valuation.fair_value_low).toLocaleString()}–
                  {Number(packet.valuation.fair_value_high).toLocaleString()}
                </strong>
              </div>
              <div>
                <small>Current</small>
                <strong>
                  {Number(packet.valuation.current_price).toLocaleString()}
                </strong>
              </div>
              <div>
                <small>Expected return</small>
                <strong>
                  {packet.scenario
                    ? `${Number(packet.scenario.expected_return_percent).toFixed(1)}%`
                    : "geen scenario"}
                </strong>
              </div>
            </div>
          ) : (
            <p className="muted">Geen point-in-time waardering.</p>
          )}
          <p className="validation-warning">
            Hypothetische band en analistaannames; geen koersvoorspelling.
          </p>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="overline">Fundamental coverage</span>
              <h2>Niet-prijs intelligence</h2>
            </div>
          </div>
          {packet.fundamentals.map((x: Record<string, unknown>) => (
            <article className="journal-entry" key={String(x.id)}>
              <div>
                <strong>{String(x.module).replaceAll("_", " ")}</strong>
                <span>{Number(x.coverage_percent).toFixed(0)}%</span>
              </div>
              <p>
                {String(x.evidence_status)} · score{" "}
                {x.score === null ? "niet berekend" : String(x.score)}
              </p>
            </article>
          ))}
        </section>
      </section>
      <section className="regime-grid v3 detail">
        <RegimeStrip
          label="Macro liquidity"
          state={item.macro_state}
          value={item.macro_score}
        />
        <RegimeStrip
          label="Crypto credit"
          state={item.crypto_state}
          value={item.crypto_score}
        />
        <RegimeStrip
          label="Market structure"
          state={item.market_structure_state}
          value={item.market_structure_score}
        />
        <RegimeStrip
          label={`${symbol} asset`}
          state={item.asset_state}
          value={item.asset_score}
        />
      </section>
      <section className="asset-intelligence-grid">
        <WhatChanged item={item} previous={previous} />
        <section className="panel factor-contribution">
          <div className="panel-head">
            <div>
              <span className="overline">Factor contribution</span>
              <h2>{symbol} regime drivers</h2>
            </div>
            <span>
              {Math.round(item.asset_factors.coverage * 100)}% assetdekking
            </span>
          </div>
          <FactorBars
            breakdown={{
              coverage: 1,
              warnings: [],
              factors: allFactors(item).filter(
                (factor, index, list) =>
                  list.findIndex(
                    (candidate) => candidate.code === factor.code,
                  ) === index,
              ),
            }}
          />
        </section>
      </section>
      <section className="detail-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <span className="overline">Market structure</span>
              <h2>Leverage en interne risico’s</h2>
            </div>
            <span>{pretty(item.market_structure_state)}</span>
          </div>
          <FactorBars breakdown={item.market_structure_factors} />
        </div>
        <aside className="panel explanation">
          <span className="overline">Current interpretation</span>
          <h2>Opportunity én risico</h2>
          <FactList
            title="Positieve drivers"
            items={item.explanation_facts.positiveDrivers}
          />
          <FactList
            title="Risk drivers"
            items={item.explanation_facts.riskDrivers}
          />
          <FactList
            title="Tegensignalen"
            items={item.explanation_facts.contradictorySignals}
          />
          {item.explanation_facts.dataWarnings?.length ? (
            <div className="warning-box">
              {item.explanation_facts.dataWarnings.map((value) => (
                <span key={value}>{value}</span>
              ))}
            </div>
          ) : null}
        </aside>
      </section>
      <RegimeTimeline points={visibleReplay} />
      <section className="panel stacked">
        <div className="panel-head">
          <div>
            <span className="overline">Inspect the evidence</span>
            <h2>Volledige factorcontext</h2>
          </div>
          <time>
            {new Intl.DateTimeFormat("nl-NL", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date(item.calculated_at))}
          </time>
        </div>
        <h3>Macro liquidity</h3>
        <FactorTable breakdown={item.macro_factors} />
        <h3>Crypto credit & liquidity</h3>
        <FactorTable breakdown={item.crypto_factors} />
        <h3>Market structure</h3>
        <FactorTable breakdown={item.market_structure_factors} />
      </section>
    </Shell>
  );
}

function FactList({
  title,
  items,
}: {
  title: string;
  items: Factor[] | undefined;
}) {
  const values = items ?? [];
  return (
    <div className="fact-list">
      <h3>{title}</h3>
      {values.length ? (
        values.map((item, index) => (
          <div key={`${item.code}-${index}`}>
            <span>{item.score !== null && item.score > 0 ? "+" : "−"}</span>
            <p>
              <strong>{label(item.code)}</strong>
              {item.description}
            </p>
          </div>
        ))
      ) : (
        <p className="muted">Geen.</p>
      )}
    </div>
  );
}
