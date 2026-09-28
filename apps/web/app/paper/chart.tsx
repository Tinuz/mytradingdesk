"use client";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisDigits } from "./axis";

type NavRow = {
  calculated_at: string;
  nav: number;
  benchmark_nav: Record<string, number | null>;
};

// Categorical order validated for the dark panel surface (#111920): lightness
// band, chroma, CVD and normal-vision separation of adjacent pairs, contrast.
const SERIES = [
  { key: "paper", label: "Jouw paperportfolio", color: "#199e70", width: 2.5 },
  { key: "BTC_HOLD", label: "BTC kopen en houden", color: "#3987e5", width: 2 },
  { key: "BTC_ETH_60_40", label: "60/40 BTC/ETH", color: "#d95926", width: 2 },
  {
    key: "BTC_CASH_50_50",
    label: "50/50 BTC/cash",
    color: "#9085e9",
    width: 2,
  },
  { key: "BTC_200DMA", label: "BTC 200DMA-trend", color: "#c98500", width: 2 },
] as const;

const day = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
});
const percent = (value: number, digits = 1) =>
  `${value > 0 ? "+" : ""}${value.toLocaleString("nl-NL", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}%`;

/**
 * Paper NAV and the frozen benchmarks as cumulative return on the same
 * starting capital, so every line shares one axis.
 */
export function PaperChart({
  rows,
  initialCapital,
}: {
  rows: NavRow[];
  initialCapital: number;
}) {
  if (rows.length < 2)
    return (
      <div className="empty-state">
        <span>Nog onvoldoende meetpunten</span>
        <p>
          Na minimaal twee dagelijkse waarderingen verschijnen hier je
          paperportfolio en de benchmarks.
        </p>
      </div>
    );
  const toReturn = (value: number | null | undefined) =>
    value == null ? null : (Number(value) / initialCapital - 1) * 100;
  const data = rows.map((row) => ({
    date: row.calculated_at,
    paper: toReturn(row.nav),
    ...Object.fromEntries(
      SERIES.slice(1).map((s) => [s.key, toReturn(row.benchmark_nav?.[s.key])]),
    ),
  })) as Array<Record<string, string | number | null>>;
  const latest = data.at(-1)!;
  const digits = axisDigits(
    data.flatMap((row) =>
      SERIES.map((s) => row[s.key]).filter(
        (value): value is number => typeof value === "number",
      ),
    ),
  );
  return (
    <figure className="paper-chart-figure">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="#1b252d" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => day.format(new Date(value))}
            stroke="#52606c"
            tick={{ fill: "#8e9ba6", fontSize: 12 }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value: number) => percent(value, digits)}
            stroke="#52606c"
            tick={{ fill: "#8e9ba6", fontSize: 12 }}
            width={64}
            domain={["auto", "auto"]}
          />
          <ReferenceLine y={0} stroke="#52606c" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{
              background: "#0d161c",
              border: "1px solid #202a33",
              color: "#e8edf2",
            }}
            labelFormatter={(value) =>
              new Date(String(value)).toLocaleDateString("nl-NL", {
                dateStyle: "medium",
              })
            }
            formatter={(value, name) => [percent(Number(value), 2), name]}
            itemStyle={{ color: "#e8edf2" }}
            separator=": "
            itemSorter={(item) =>
              SERIES.findIndex((series) => series.key === item.dataKey)
            }
          />
          <Legend
            wrapperStyle={{ color: "#aab6bf", fontSize: 12 }}
            itemSorter={(item) =>
              SERIES.findIndex((series) => series.key === item.dataKey)
            }
          />
          {[...SERIES.slice(1), SERIES[0]].map((series) => (
            <Line
              key={series.key}
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={series.width}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <figcaption className="muted">
        Cumulatief rendement op hetzelfde startkapitaal. Benchmarks volgen het
        bevroren protocol, inclusief kosten.
      </figcaption>
      <details className="chart-table">
        <summary>Toon als tabel</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Reeks</th>
              <th scope="col">Rendement sinds start (laatste waardering)</th>
            </tr>
          </thead>
          <tbody>
            {SERIES.map((series) => (
              <tr key={series.key}>
                <th scope="row">{series.label}</th>
                <td>
                  {latest[series.key] == null
                    ? "—"
                    : percent(Number(latest[series.key]), 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
