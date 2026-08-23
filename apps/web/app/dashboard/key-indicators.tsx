import Link from "next/link";
import { indicatorSeries } from "../../lib/data";
import { IndicatorSparkline } from "../indicators/visuals";

const cards = [
  {
    slug: "global-liquidity",
    code: "GLOBAL_LIQUIDITY_USD",
    label: "Global Liquidity",
    question: "Breidt externe liquiditeit uit?",
  },
  {
    slug: "stablecoins",
    code: "STABLECOIN_SUPPLY_USD",
    label: "Stablecoin Supply",
    question: "Groeit crypto-native liquiditeit?",
  },
  {
    slug: "etf-flows",
    code: "BTC_ETF_FLOW_20D_USD",
    label: "BTC ETF · 20d",
    question: "Bevestigt institutionele vraag?",
  },
  {
    slug: "defi-credit",
    code: "DEFI_ACTIVE_LOANS_USD",
    label: "DeFi Loans",
    question: "Breidt on-chain krediet uit?",
  },
  {
    slug: "mvrv",
    code: "BTC_MVRV",
    label: "BTC MVRV",
    question: "Stijgt waarderingsdruk?",
  },
  {
    slug: "leverage",
    code: "BTC_OI_MARKET_CAP_RATIO",
    label: "OI / Market Cap",
    question: "Neemt relatieve leverage toe?",
  },
] as const;
const format = (value: number, unit: string) =>
  unit === "ratio"
    ? value.toFixed(4)
    : unit.includes("percent")
      ? `${value.toFixed(2)}%`
      : new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 2,
        }).format(value);

export async function KeyIndicators() {
  const rows = await indicatorSeries(cards.map((card) => card.code));
  return (
    <>
      <div className="section-title">
        <div>
          <span className="overline">Underlying factors</span>
          <h2>Inspecteer de belangrijkste reeksen</h2>
        </div>
        <p>Elke grafiek beantwoordt één investeringsvraag.</p>
      </div>
      <section className="key-indicator-grid">
        {cards.map((card) => {
          const series = rows.find((row) => row.code === card.code),
            latest = series?.points.at(-1);
          return (
            <Link
              className={`key-indicator-card ${!latest ? "missing" : ""}`}
              href={`/indicators/${card.slug}`}
              key={card.code}
            >
              <header>
                <div>
                  <span className="micro-label">{card.question}</span>
                  <h3>{card.label}</h3>
                </div>
                <span className={latest ? "fresh-badge" : "warning-badge"}>
                  {latest ? series!.source_type : "NO DATA"}
                </span>
              </header>
              {series ? (
                <IndicatorSparkline
                  series={series}
                  bars={card.code.includes("ETF_FLOW")}
                />
              ) : (
                <div className="spark-empty">INDICATOR NOT IMPLEMENTED</div>
              )}
              <footer>
                <strong>
                  {latest
                    ? format(latest.value, series!.unit)
                    : "Niet beschikbaar"}
                </strong>
                <span>
                  {latest
                    ? new Date(latest.date).toLocaleDateString("nl-NL")
                    : "Geen historie"}
                </span>
              </footer>
            </Link>
          );
        })}
      </section>
    </>
  );
}
