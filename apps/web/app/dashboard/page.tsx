import Link from "next/link";
import {
  dashboardHistory,
  decisions,
  indicatorHealth,
  trustStatus,
  type DecisionView,
  type Factor,
} from "../../lib/data";
import { pretty, score, tone } from "../ui/regime";
import { InfoTip } from "../ui/info-tip";
import { Shell } from "../ui/shell";
import { AssetPriceChart, RegimeTimeline } from "./visuals";
import { KeyIndicators } from "./key-indicators";
const direction = (current: number, previous: number | undefined) =>
  previous == null || current === previous
    ? { arrow: "→", label: "STABLE" }
    : current > previous
      ? { arrow: "↑", label: "IMPROVING" }
      : { arrow: "↓", label: "DETERIORATING" };
const factors = (item: DecisionView): Array<Factor & { score: number }> =>
  [
    ...item.macro_factors.factors,
    ...item.crypto_factors.factors,
    ...item.market_structure_factors.factors,
    ...item.asset_factors.factors,
  ].map((factor) => ({ ...factor, score: factor.score ?? 0 }));
const changedFactors = (
  current: DecisionView,
  previous: DecisionView | undefined,
) => {
  const before = new Map(
    (previous ? factors(previous) : []).map((value) => [
      value.code,
      value.score,
    ]),
  );
  return factors(current)
    .filter(
      (factor, index, list) =>
        list.findIndex((value) => value.code === factor.code) === index,
    )
    .map((factor) => ({
      ...factor,
      change: factor.score - (before.get(factor.code) ?? factor.score),
    }))
    .sort(
      (a, b) =>
        Math.abs(b.change) - Math.abs(a.change) ||
        Math.abs(b.score) - Math.abs(a.score),
    )
    .slice(0, 6);
};
const factorLabel = (factor: Factor) => factor.code.replaceAll("_", " ");
function EnvironmentCard({
  index,
  label,
  state,
  value,
  previous,
  help,
}: {
  index: string;
  label: string;
  state: string;
  value: number;
  previous?: number | undefined;
  help: { title: string; description: string; watchFor: readonly string[] };
}) {
  const move = direction(value, previous);
  return (
    <article className={`environment-card ${tone(value)}`}>
      <span className="micro-label metric-label">
        {index} / {label}
        <InfoTip label={label} title={help.title} watchFor={help.watchFor}>
          {help.description}
        </InfoTip>
      </span>
      <strong>{pretty(state)}</strong>
      <div
        className="regime-axis"
        aria-label={`${label}: ${pretty(state)}, ${move.label}`}
      >
        <span />
        <i
          style={{ left: `${Math.max(4, Math.min(96, (value + 2) * 25))}%` }}
        />
      </div>
      <footer>
        <span>
          {move.arrow} {move.label}
        </span>
        <em>modelstaat {score(value)}</em>
      </footer>
    </article>
  );
}
function AssetSummary({
  item,
  previous,
  history,
}: {
  item: DecisionView;
  previous?: DecisionView | undefined;
  history: Awaited<ReturnType<typeof dashboardHistory>>;
}) {
  const move = direction(item.asset_score, previous?.asset_score);
  return (
    <Link
      href={`/assets/${item.symbol.toLowerCase()}`}
      className="visual-asset-card"
    >
      <header>
        <div>
          <span className="overline">{item.asset_name}</span>
          <h3>{item.symbol}</h3>
        </div>
        <span className={`confidence ${item.confidence_level.toLowerCase()}`}>
          {item.confidence_level} confidence
        </span>
      </header>
      <div className={`asset-regime ${tone(item.asset_score)}`}>
        <strong>{pretty(item.decision_state)}</strong>
        <span>
          {move.arrow} {move.label}
        </span>
      </div>
      <AssetPriceChart symbol={item.symbol} points={history} />
      <div className="asset-layers">
        <span>
          <small>Macro</small>
          {score(item.macro_score)}
        </span>
        <span>
          <small>Crypto</small>
          {score(item.crypto_score)}
        </span>
        <span>
          <small>Structure</small>
          {score(item.market_structure_score)}
        </span>
        <span>
          <small>Asset</small>
          {score(item.asset_score)}
        </span>
      </div>
      <footer>
        <span>
          {item.risk_override === "NONE"
            ? "Geen risk override"
            : pretty(item.risk_override)}
        </span>
        <time>
          Snapshot{" "}
          {new Intl.DateTimeFormat("nl-NL", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(item.calculated_at))}
        </time>
      </footer>
    </Link>
  );
}
export default async function DashboardPage() {
  const [history, health, trust, timeline] = await Promise.all([
    decisions(100),
    indicatorHealth(),
    trustStatus(),
    dashboardHistory(),
  ]);
  const latest = [
    history.find((x) => x.symbol === "BTC"),
    history.find((x) => x.symbol === "ETH"),
  ].filter((item): item is DecisionView => Boolean(item));
  const reference = latest[0],
    previous = reference
      ? history.find(
          (item) =>
            item.symbol === reference.symbol && item.id !== reference.id,
        )
      : undefined;
  const unhealthy = health.filter((item) => item.freshness !== "FRESH");
  if (!reference)
    return (
      <Shell current="dashboard">
        <header className="page-head">
          <div>
            <span className="overline">Market intelligence</span>
            <h1>Market Environment</h1>
          </div>
        </header>
        <section className="empty-state">
          <span>NO DATA AVAILABLE</span>
          <h2>De intelligence-laag heeft nog geen snapshot.</h2>
        </section>
      </Shell>
    );
  const changes = changedFactors(reference, previous),
    support = factors(reference)
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
    risks = factors(reference)
      .filter((item) => item.score < 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  const previousByAsset = new Map(
    latest.map((item) => [
      item.symbol,
      history.find((row) => row.symbol === item.symbol && row.id !== item.id),
    ]),
  );
  const opportunityMove =
    reference.opportunity_score === null
      ? { arrow: "→", label: "UNAVAILABLE" }
      : direction(reference.opportunity_score, previous?.opportunity_score ?? undefined);
  return (
    <Shell current="dashboard">
      <header className="intelligence-head">
        <div>
          <span className="overline">
            Market environment / shadow intelligence
          </span>
          <span className="title-with-info">
            <h1>{reference.opportunity_state ? pretty(reference.opportunity_state) : "OPPORTUNITY UNAVAILABLE"}</h1>
            <InfoTip
              label="Market Environment"
              title="Samenvatting van het marktklimaat"
              watchFor={[
                "Kijk of macro, crypto-credit en het assetregime elkaar bevestigen.",
                "Lees Market Structure daarnaast als zelfstandige stressas.",
              ]}
            >
              Toont de opgeslagen opportunity-staat uit macro, crypto-credit en
              het assetregime. Market Structure wordt hier bewust niet bij
              opgeteld en blijft een zelfstandige stressas.
            </InfoTip>
          </span>
          <p>
            {reference.macro_score > 0 && reference.crypto_score > 0
              ? "Macro- en crypto-liquiditeit bevestigen elkaar."
              : "Macro- en crypto-liquiditeit geven geen volledige bevestiging."}{" "}
            Marktrisico blijft afzonderlijk zichtbaar.
          </p>
        </div>
        <div className="environment-direction">
          <span>{opportunityMove.arrow}</span>
          <div>
            <small className="metric-label">
              Opportunity direction
              <InfoTip
                label="Opportunity direction"
                title="Verandering sinds de vorige snapshot"
                align="right"
                watchFor={[
                  "Zoek bevestiging in meerdere opeenvolgende snapshots.",
                  "STABLE betekent onveranderd model, niet lage volatiliteit.",
                ]}
              >
                Vergelijkt alleen de opgeslagen opportunity-score met de vorige
                live snapshot. Market stress is hiervan uitgesloten.
              </InfoTip>
            </small>
            <strong>{opportunityMove.label}</strong>
            <time>
              Updated{" "}
              {new Intl.DateTimeFormat("nl-NL", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(reference.calculated_at))}
            </time>
          </div>
        </div>
      </header>
      {trust && (
        <section
          className={`trust-banner ${trust.decision_freshness.toLowerCase()}`}
        >
          <strong className="metric-label">
            DATA{" "}
            {trust.decision_freshness === "CURRENT" && unhealthy.length === 0
              ? "HEALTHY"
              : "DEGRADED"}
            <InfoTip
              label="Data quality"
              title="Betrouwbaarheid van de invoer"
              watchFor={[
                "Controleer stale en ontbrekende bronnen vóór een beslissing.",
                "DEGRADED verlaagt vertrouwen; het is niet bearish op zichzelf.",
              ]}
            >
              Toont hoeveel vereiste indicatoren vers, vertraagd of ontbrekend
              zijn en of de modelsnapshot actueel is.
            </InfoTip>
          </strong>
          <span>
            {trust.fresh_indicators}/
            {trust.fresh_indicators +
              trust.stale_indicators +
              trust.missing_indicators}{" "}
            indicatoren vers · {trust.stale_indicators} stale ·{" "}
            {trust.missing_indicators} ontbrekend · model{" "}
            {trust.model_validation_status}
          </span>
          {(unhealthy.length > 0 || trust.decision_freshness !== "CURRENT") && (
            <em>Inspecteer vóór een menselijke beslissing.</em>
          )}
        </section>
      )}
      <section className="environment-grid">
        <EnvironmentCard
          index="01"
          label="Macro liquidity"
          state={reference.macro_state}
          value={reference.macro_score}
          previous={previous?.macro_score}
          help={{
            title: "Externe liquiditeitsomgeving",
            description:
              "Meet via macroproxies of mondiale financieringscondities verruimen of verkrappen.",
            watchFor: [
              "Volg brede bevestiging over meerdere maanden.",
              "Een positieve score garandeert geen directe cryptostijging.",
            ],
          }}
        />
        <EnvironmentCard
          index="02"
          label="Crypto credit"
          state={reference.crypto_state}
          value={reference.crypto_score}
          previous={previous?.crypto_score}
          help={{
            title: "Crypto-native krediet en kapitaal",
            description:
              "Vat stablecoin-groei, DeFi-krediet en ETF-stromen samen als maat voor beschikbaar cryptokapitaal.",
            watchFor: [
              "Let op versnelling én bevestiging tussen reeksen.",
              "Kredietgroei kan ook speculatieve leverage voeden.",
            ],
          }}
        />
        <EnvironmentCard
          index="03"
          label="Market structure"
          state={reference.market_structure_state}
          value={reference.market_structure_score}
          previous={previous?.market_structure_score}
          help={{
            title: "Interne gezondheid van de markt",
            description:
              "Combineert waardering, leverage, deleveraging en gerealiseerde verliezen tot een structurele risicostaat.",
            watchFor: [
              "Leverage plus verliezen is kwetsbaarder dan één signaal.",
              "Dit is een risicolaag, geen richtingvoorspeller.",
            ],
          }}
        />
        <article
          className={`environment-card ${unhealthy.length ? "negative" : "positive"}`}
        >
          <span className="micro-label metric-label">
            04 / Data integrity
            <InfoTip
              label="Data integrity"
              title="Dekking en actualiteit"
              align="right"
              watchFor={[
                "Open bronnen bij stale of missing data.",
                "Onvolledige data kan confidence en beslissingen vertekenen.",
              ]}
            >
              Het aandeel kernindicatoren dat binnen de verwachte
              verversingsfrequentie beschikbaar is.
            </InfoTip>
          </span>
          <strong>{unhealthy.length ? "DEGRADED" : "HEALTHY"}</strong>
          <div className="integrity-count">
            <b>
              {health.length - unhealthy.length}/{health.length}
            </b>
            <span>indicatoren vers</span>
          </div>
          <footer>
            <Link href="/research">Inspecteer bronnen →</Link>
            <em>{unhealthy.length} aandachtspunten</em>
          </footer>
        </article>
      </section>
      <RegimeTimeline points={timeline} />
      <div className="section-title">
        <div>
          <span className="overline">BTC / ETH</span>
          <h2 className="metric-label">
            Asset regimes
            <InfoTip
              label="Asset regimes"
              title="Beslisstaat per asset"
              watchFor={[
                "Controleer welke van de vier lagen de uitkomst draagt.",
                "Confidence is overeenstemming, geen kanspercentage.",
              ]}
            >
              Combineert macro, crypto-credit, marktstructuur en assetspecifieke
              signalen. Hysterese voorkomt omslaan bij kleine bewegingen.
            </InfoTip>
          </h2>
        </div>
        <p>Prijs is uitkomst; de vier modelagen blijven zichtbaar.</p>
      </div>
      <section className="visual-asset-grid">
        {latest.map((item) => (
          <AssetSummary
            item={item}
            previous={previousByAsset.get(item.symbol)}
            history={timeline}
            key={item.id}
          />
        ))}
      </section>
      <section className="change-panel panel">
        <div className="panel-head">
          <div>
            <span className="overline">What changed?</span>
            <h2 className="metric-label">
              Beweging vóór niveau
              <InfoTip
                label="What changed"
                title="Verandering in modelbijdragen"
                watchFor={[
                  "Geef meer gewicht aan meerdere onafhankelijke veranderingen.",
                  "Een pijl toont modelrichting, niet de volgende koersbeweging.",
                ]}
              >
                Vergelijkt iedere factorscore met de vorige live snapshot en
                maakt een draai zichtbaar voordat het totaallabel verandert.
              </InfoTip>
            </h2>
          </div>
          <span>vs. vorige live snapshot</span>
        </div>
        <div className="change-list">
          {changes.map((item) => {
            return (
              <div key={item.code}>
                <span
                  className={
                    item.change > 0
                      ? "positive"
                      : item.change < 0
                        ? "negative"
                        : "neutral"
                  }
                >
                  {item.change > 0 ? "↑" : item.change < 0 ? "↓" : "→"}
                </span>
                <strong>{factorLabel(item)}</strong>
                <em>
                  {item.change === 0
                    ? "STABLE"
                    : item.change > 0
                      ? "IMPROVING"
                      : "DETERIORATING"}
                </em>
                <i>
                  <b
                    style={{
                      width: `${Math.max(8, Math.abs(item.score) * 40)}%`,
                    }}
                  />
                </i>
                <small>{score(item.score)}</small>
              </div>
            );
          })}
        </div>
      </section>
      <KeyIndicators />
      <section className="evidence-grid">
        <article className="panel">
          <span className="overline">Why?</span>
          <h2 className="metric-label">
            Bevestiging en tegensignalen
            <InfoTip
              label="Supportive en risk"
              title="Waarom het model tot deze staat komt"
              watchFor={[
                "Scores zijn ordinale bijdragen, geen percentages.",
                "Tegensignalen blijven relevant bij een positieve eindstaat.",
              ]}
            >
              Supportive toont positieve modelbijdragen; Risk toont negatieve.
              Zo worden consensus en interne tegenstrijdigheid zichtbaar.
            </InfoTip>
          </h2>
          <div className="driver-columns">
            <div>
              <h3>Supportive</h3>
              {support.map((item) => (
                <p key={item.code}>
                  <span>+{item.score}</span>
                  {factorLabel(item)}
                </p>
              ))}
            </div>
            <div>
              <h3>Risk</h3>
              {risks.map((item) => (
                <p key={item.code}>
                  <span>{item.score}</span>
                  {factorLabel(item)}
                </p>
              ))}
              {!risks.length && (
                <p>
                  <span>—</span>Geen negatieve factor in snapshot
                </p>
              )}
            </div>
          </div>
        </article>
        <aside className="method-note invalidation">
          <span className="overline">What could invalidate this view?</span>
          <h2>
            {risks.length ? "Risico is aanwezig." : "Let op verslechtering."}
          </h2>
          <p>
            {risks.length
              ? `De sterkste negatieve input is ${factorLabel(risks[0]!)} (${score(risks[0]!.score)}). `
              : "Er is nu geen negatieve factorscore. "}
            Een daling in crypto-credit of marktstructuur kan de huidige
            omgeving ondermijnen. Dit is een modelclassificatie, geen
            voorspelling.
          </p>
          <Link href="/journal">Leg een menselijke beslissing vast →</Link>
        </aside>
      </section>
    </Shell>
  );
}
