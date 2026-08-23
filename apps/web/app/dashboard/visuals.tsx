"use client";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardHistoryPoint } from "../../lib/data";
import { InfoTip } from "../ui/info-tip";
const tone = (score: number) =>
  score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
const short = (date: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" }).format(
    new Date(`${date}T00:00:00Z`),
  );
export function RegimeTimeline({
  points,
}: {
  points: DashboardHistoryPoint[];
}) {
  const [range, setRange] = useState<"3M" | "6M" | "1Y" | "2Y" | "MAX">("1Y");
  const filtered = useMemo(() => {
    const days = { "3M": 92, "6M": 183, "1Y": 365, "2Y": 730, MAX: 99999 }[
        range
      ],
      latest = Math.max(
        ...points.map((point) => Date.parse(point.evaluation_date)),
      ),
      cutoff = latest - days * 86_400_000;
    return points.filter(
      (point) => Date.parse(point.evaluation_date) >= cutoff,
    );
  }, [points, range]);
  const btc = filtered.filter((point) => point.assets?.symbol === "BTC"),
    eth = filtered.filter((point) => point.assets?.symbol === "ETH");
  const rows = [
    { label: "Macro liquidity", values: btc, key: "macro_score" },
    { label: "Crypto credit", values: btc, key: "crypto_score" },
    { label: "Market structure", values: btc, key: "market_structure_score" },
    { label: "BTC asset", values: btc, key: "asset_score" },
    { label: "ETH asset", values: eth, key: "asset_score" },
  ] as const;
  return (
    <section className="panel regime-timeline">
      <div className="panel-head">
        <div>
          <span className="overline">Where did we come from?</span>
          <h2 className="metric-label">
            Market Regime Timeline
            <InfoTip
              label="Market Regime Timeline"
              title="Historische modeltoestanden"
              watchFor={[
                "Zoek langdurige bevestiging of divergentie tussen de rijen.",
                "De historie is gereconstrueerd en niet volledig point-in-time.",
              ]}
            >
              Iedere gekleurde cel is de dagelijkse ordinale toestand van één
              modellaag. Groen is ondersteunend, amber neutraal en rood risico.
            </InfoTip>
          </h2>
        </div>
        <div className="range-switch" aria-label="Tijdsperiode">
          {(["3M", "6M", "1Y", "2Y", "MAX"] as const).map((value) => (
            <button
              className={range === value ? "active" : ""}
              onClick={() => setRange(value)}
              key={value}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {!filtered.length ? (
        <div className="chart-empty">HISTORISCHE DATA NOG NIET BESCHIKBAAR</div>
      ) : (
        <div
          className="timeline-plot"
          role="img"
          aria-label="Historische regimes voor macro, crypto, marktstructuur, BTC en ETH"
        >
          {rows.map((row) => (
            <div className="timeline-row" key={row.label}>
              <strong>{row.label}</strong>
              <div>
                {row.values.map((point, index) => {
                  const score = Number(point[row.key]);
                  return (
                    <span
                      key={`${point.evaluation_date}-${index}`}
                      className={tone(score)}
                      title={`${point.evaluation_date} · ${String(point[row.key.replace("score", "state") as keyof DashboardHistoryPoint])} · score ${score}`}
                      style={{
                        width: `${100 / Math.max(row.values.length, 1)}%`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <footer>
        <span>■ ondersteunend</span>
        <span>■ neutraal</span>
        <span>■ risico</span>
        <em>Dagelijkse gereconstrueerde historie; geen causaliteitsclaim.</em>
      </footer>
    </section>
  );
}
export function AssetPriceChart({
  symbol,
  points,
}: {
  symbol: "BTC" | "ETH";
  points: DashboardHistoryPoint[];
}) {
  const data = points.filter((point) => point.assets?.symbol === symbol);
  return (
    <div
      className="mini-price"
      aria-label={`${symbol} prijs en 200-daags gemiddelde`}
    >
      <ResponsiveContainer width="100%" height={92}>
        {data.length ? (
          <LineChart
            data={data}
            margin={{ top: 8, right: 2, bottom: 0, left: 2 }}
          >
            <XAxis dataKey="evaluation_date" hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="chart-tooltip">
                    <strong>
                      {short(String(payload[0].payload.evaluation_date))}
                    </strong>
                    <span>
                      Prijs{" "}
                      {new Intl.NumberFormat("nl-NL", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      }).format(Number(payload[0].payload.price))}
                    </span>
                    <span>
                      200DMA{" "}
                      {payload[0].payload.dma_200
                        ? new Intl.NumberFormat("nl-NL", {
                            maximumFractionDigits: 0,
                          }).format(payload[0].payload.dma_200)
                        : "niet beschikbaar"}
                    </span>
                    <span>
                      Regime{" "}
                      {String(payload[0].payload.decision_state).replaceAll(
                        "_",
                        " ",
                      )}
                    </span>
                  </div>
                ) : null
              }
            />
            <Line
              type="linear"
              dataKey="price"
              stroke="#dce6ec"
              dot={false}
              strokeWidth={1.6}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="dma_200"
              stroke="#d4aa67"
              dot={false}
              strokeDasharray="4 4"
              connectNulls={false}
              isAnimationActive={false}
            />
            {data
              .filter((point) => point.transitioned)
              .map((point) => (
                <ReferenceDot
                  key={point.evaluation_date}
                  x={point.evaluation_date}
                  y={point.price}
                  r={3}
                  fill="#d4aa67"
                  stroke="none"
                />
              ))}
          </LineChart>
        ) : (
          <AreaChart data={[]}>
            <Area dataKey="price" />
          </AreaChart>
        )}
      </ResponsiveContainer>
      <div className="chart-key">
        <span>— prijs</span>
        <span>┄ 200DMA</span>
        <span>● transitie</span>
      </div>
    </div>
  );
}

export function AssetDetailChart({
  symbol,
  points,
}: {
  symbol: "BTC" | "ETH";
  points: DashboardHistoryPoint[];
}) {
  const [range, setRange] = useState<"3M" | "6M" | "1Y" | "MAX">("1Y");
  const data = useMemo(() => {
    const asset = points.filter((point) => point.assets?.symbol === symbol);
    if (!asset.length || range === "MAX") return asset;
    const days = { "3M": 92, "6M": 183, "1Y": 365 }[range];
    const latest = Date.parse(asset.at(-1)!.evaluation_date);
    return asset.filter(
      (point) =>
        Date.parse(point.evaluation_date) >= latest - days * 86_400_000,
    );
  }, [points, range, symbol]);
  return (
    <section className="panel asset-chart-panel">
      <div className="panel-head">
        <div>
          <span className="overline">Price is the observed outcome</span>
          <h2>{symbol} prijs en regime-overgangen</h2>
        </div>
        <div className="range-switch" aria-label="Tijdsperiode">
          {(["3M", "6M", "1Y", "MAX"] as const).map((value) => (
            <button
              type="button"
              className={range === value ? "active" : ""}
              onClick={() => setRange(value)}
              key={value}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {!data.length ? (
        <div className="chart-empty">
          HISTORISCHE PRIJS NOG NIET BESCHIKBAAR
        </div>
      ) : (
        <div className="detail-price-chart">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={data}
              margin={{ top: 12, right: 12, left: 2, bottom: 4 }}
            >
              <XAxis
                dataKey="evaluation_date"
                tickFormatter={short}
                minTickGap={48}
                tick={{ fill: "#687681", fontSize: 9 }}
                axisLine={{ stroke: "#27323a" }}
                tickLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                width={58}
                tickFormatter={(value) =>
                  new Intl.NumberFormat("en", { notation: "compact" }).format(
                    value,
                  )
                }
                tick={{ fill: "#687681", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="chart-tooltip">
                      <strong>
                        {String(payload[0].payload.evaluation_date)}
                      </strong>
                      <span>
                        Prijs $
                        {new Intl.NumberFormat("en-US", {
                          maximumFractionDigits: 0,
                        }).format(payload[0].payload.price)}
                      </span>
                      <span>
                        200DMA{" "}
                        {payload[0].payload.dma_200
                          ? `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(payload[0].payload.dma_200)}`
                          : "niet beschikbaar"}
                      </span>
                      <span>
                        Decision{" "}
                        {String(payload[0].payload.decision_state).replaceAll(
                          "_",
                          " ",
                        )}
                      </span>
                      <span>Data quality RECONSTRUCTED</span>
                    </div>
                  ) : null
                }
              />
              <Line
                type="linear"
                dataKey="price"
                stroke="#dce6ec"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="dma_200"
                stroke="#d4aa67"
                dot={false}
                strokeDasharray="5 5"
                connectNulls={false}
                isAnimationActive={false}
              />
              {data
                .filter((point) => point.transitioned)
                .map((point) => (
                  <ReferenceDot
                    key={point.evaluation_date}
                    x={point.evaluation_date}
                    y={point.price}
                    r={4}
                    fill="#d4aa67"
                    stroke="#091016"
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <footer className="chart-provenance">
        <span>Prijs — CoinGecko</span>
        <span>Frequentie — dagelijks</span>
        <span>Kwaliteit — reconstructed</span>
        <em>
          Prijs en regimes worden ter vergelijking getoond; geen
          causaliteitsclaim.
        </em>
      </footer>
    </section>
  );
}
