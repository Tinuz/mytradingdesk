import Link from "next/link";
import { notFound } from "next/navigation";
import { indicatorSeries } from "../../../lib/data";
import { Shell } from "../../ui/shell";
import { IndicatorChart } from "../visuals";

const groups = {
  "global-liquidity": {
    title: "Global Liquidity",
    question: "Breidt externe liquiditeit uit of trekt zij samen?",
    codes: ["GLOBAL_LIQUIDITY_USD"],
  },
  stablecoins: {
    title: "Stablecoin Liquidity",
    question: "Groeit crypto-native liquiditeit en versnelt die groei?",
    codes: [
      "STABLECOIN_SUPPLY_USD",
      "STABLECOIN_GROWTH_30D_PERCENT",
      "STABLECOIN_GROWTH_90D_PERCENT",
      "STABLECOIN_GROWTH_ACCELERATION_PP",
    ],
  },
  "etf-flows": {
    title: "ETF Flows",
    question: "Wordt institutionele spotvraag structureel sterker of zwakker?",
    codes: [
      "BTC_ETF_NET_FLOW_USD",
      "BTC_ETF_FLOW_20D_USD",
      "ETH_ETF_NET_FLOW_USD",
      "ETH_ETF_FLOW_20D_USD",
    ],
  },
  "defi-credit": {
    title: "DeFi Credit",
    question: "Breidt on-chain krediet uit of is er deleveraging?",
    codes: ["DEFI_ACTIVE_LOANS_USD", "DEFI_LOANS_GROWTH_30D_PERCENT"],
  },
  mvrv: {
    title: "BTC MVRV",
    question:
      "Hoe ontwikkelt marktwaarde zich ten opzichte van gerealiseerd kapitaal?",
    codes: ["BTC_MVRV"],
  },
  leverage: {
    title: "Derivatives Leverage",
    question: "Stijgt open interest ten opzichte van de omvang van de markt?",
    codes: [
      "BTC_OI_MARKET_CAP_RATIO",
      "BTC_PERPETUAL_OI_USD",
      "BTC_MARKET_CAP_USD",
    ],
  },
} as const;

export default async function IndicatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const group = groups[slug as keyof typeof groups];
  if (!group) notFound();
  const series = await indicatorSeries(group.codes);
  return (
    <Shell current="research">
      <header className="page-head">
        <div>
          <Link href="/dashboard" className="back-link">
            ← Dashboard
          </Link>
          <span className="overline">Indicator intelligence / hypothesis</span>
          <h1>{group.title}</h1>
          <p>{group.question}</p>
        </div>
        <div className="asof">
          Coverage
          <strong>
            {series.filter((item) => item.points.length).length}/
            {group.codes.length} reeksen
          </strong>
        </div>
      </header>
      <section className="indicator-stack">
        {group.codes.map((code) => {
          const item = series.find((candidate) => candidate.code === code);
          return item ? (
            <article className="panel" key={code}>
              <IndicatorChart
                series={item}
                bars={code.includes("ETF_NET_FLOW")}
              />
              <div className="indicator-method">
                <span>
                  Factorclassificatie
                  <strong>{item.factor_classification ?? "CONTEXT"}</strong>
                </span>
                <span>
                  Validatiestatus
                  <strong>{item.classification_status ?? "UNVALIDATED"}</strong>
                </span>
                <span>
                  Laatste observatie
                  <strong>
                    {item.points.at(-1)
                      ? new Date(item.points.at(-1)!.date).toLocaleDateString(
                          "nl-NL",
                        )
                      : "Geen data"}
                  </strong>
                </span>
              </div>
            </article>
          ) : (
            <article className="panel chart-empty" key={code}>
              {code}: INDICATOR NIET BESCHIKBAAR
            </article>
          );
        })}
      </section>
      <aside className="method-note indicator-caveat">
        <span className="overline">Interpretation guardrail</span>
        <h2>Vergelijking, geen causaliteit.</h2>
        <p>
          Deze grafieken tonen de opgeslagen reeksen en afgeleide modelinputs.
          Samenloop met BTC of ETH bewijst geen oorzakelijk verband en de
          factoren blijven een ongevalideerde hypothese.
        </p>
      </aside>
    </Shell>
  );
}
