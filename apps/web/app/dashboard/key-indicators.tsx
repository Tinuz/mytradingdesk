import Link from "next/link";
import { indicatorSeries } from "../../lib/data";
import { IndicatorSparkline } from "../indicators/visuals";
import { InfoTip } from "../ui/info-tip";

const cards = [
  {
    slug: "global-liquidity",
    code: "GLOBAL_LIQUIDITY_USD",
    label: "Global Liquidity",
    question: "Breidt externe liquiditeit uit?",
    info: "Proxy voor de brede mondiale financieringsruimte, opgebouwd uit centrale-bankliquiditeit en relevante macro-inputs.",
    watch: [
      "Volg richting en versnelling over meerdere maanden.",
      "Een stijging garandeert geen directe cryptorally.",
    ],
  },
  {
    slug: "stablecoins",
    code: "STABLECOIN_SUPPLY_USD",
    label: "Stablecoin Supply",
    question: "Groeit crypto-native liquiditeit?",
    info: "Totale circulerende waarde van gevolgde USD-stablecoins; een proxy voor direct inzetbaar crypto-native kapitaal.",
    watch: [
      "Vergelijk groei over 30 en 90 dagen.",
      "Uitgifte betekent niet dat het kapitaal al wordt ingezet.",
    ],
  },
  {
    slug: "etf-flows",
    code: "BTC_ETF_FLOW_20D_USD",
    label: "BTC ETF · 20d",
    question: "Bevestigt institutionele vraag?",
    info: "Voortschrijdende som van netto spot-Bitcoin-ETF-stromen over twintig handelsdagen.",
    watch: [
      "Let op teken en persistentie, niet op één dagpiek.",
      "Dit dekt slechts één institutioneel kanaal.",
    ],
  },
  {
    slug: "defi-credit",
    code: "DEFI_ACTIVE_LOANS_USD",
    label: "DeFi Loans",
    question: "Breidt on-chain krediet uit?",
    info: "Actieve leningen binnen een vaste set gevolgde DeFi-protocollen, als maat voor on-chain kredietactiviteit.",
    watch: [
      "Let op duurzame groei of snelle deleveraging.",
      "De reeks vertegenwoordigt niet de volledige DeFi-markt.",
    ],
  },
  {
    slug: "mvrv",
    code: "BTC_MVRV",
    label: "BTC MVRV",
    question: "Stijgt waarderingsdruk?",
    info: "Market Value to Realized Value vergelijkt marktwaarde met de geaggregeerde kostprijs van het netwerk.",
    watch: [
      "Gebruik trend en marktcontext; er is geen universele verkoopgrens.",
      "Een hogere waarde wijst op meer ongerealiseerde winst.",
    ],
  },
  {
    slug: "leverage",
    code: "BTC_OI_MARKET_CAP_RATIO",
    label: "OI / Market Cap",
    question: "Neemt relatieve leverage toe?",
    info: "Perpetual open interest gedeeld door marktkapitalisatie, zodat leverage vergelijkbaar blijft bij een veranderende marktgrootte.",
    watch: [
      "Combineer een stijging met drawdowns en gerealiseerde verliezen.",
      "De ratio toont geen long/short-richting.",
    ],
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
            <article
              className={`key-indicator-card ${!latest ? "missing" : ""}`}
              key={card.code}
            >
              <header>
                <Link href={`/indicators/${card.slug}`}>
                  <span className="micro-label">{card.question}</span>
                  <h3>{card.label}</h3>
                </Link>
                <div className="indicator-card-tools">
                  <span className={latest ? "fresh-badge" : "warning-badge"}>
                    {latest ? series!.source_type : "NO DATA"}
                  </span>
                  <InfoTip
                    label={card.label}
                    title={card.label}
                    watchFor={card.watch}
                    align="right"
                  >
                    {card.info}
                  </InfoTip>
                </div>
              </header>
              <Link
                className="key-indicator-body"
                href={`/indicators/${card.slug}`}
              >
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
            </article>
          );
        })}
      </section>
    </>
  );
}
