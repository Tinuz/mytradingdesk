"use client";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IndicatorSeries } from "../../lib/data";

const compact = (value: number, unit: string) =>
  unit === "percent" || unit === "percentage_points"
    ? `${value.toFixed(2)}%`
    : unit === "ratio"
      ? value.toFixed(4)
      : new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 2,
        }).format(value);
const day = (value: string) =>
  new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(value));

export function IndicatorChart({
  series,
  bars = false,
}: {
  series: IndicatorSeries;
  bars?: boolean;
}) {
  const [range, setRange] = useState<"3M" | "6M" | "1Y" | "2Y" | "MAX">("1Y");
  const data = useMemo(() => {
    if (!series.points.length || range === "MAX") return series.points;
    const days = { "3M": 92, "6M": 183, "1Y": 365, "2Y": 730 }[range];
    const end = new Date(series.points.at(-1)!.date).getTime();
    return series.points.filter(
      (point) => new Date(point.date).getTime() >= end - days * 86_400_000,
    );
  }, [range, series.points]);
  const Chart = bars ? BarChart : LineChart;
  return (
    <section className="indicator-chart">
      <div className="indicator-chart-head">
        <div>
          <span className="overline">
            {series.factor_family?.replaceAll("_", " ") ?? series.category}
          </span>
          <h2>{series.name}</h2>
        </div>
        <div className="range-switch">
          {(["3M", "6M", "1Y", "2Y", "MAX"] as const).map((value) => (
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
        <div className="chart-empty">HISTORISCHE DATA NOG NIET BESCHIKBAAR</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <Chart
            data={data}
            margin={{ top: 12, right: 12, left: 3, bottom: 4 }}
          >
            <XAxis
              dataKey="date"
              tickFormatter={day}
              minTickGap={48}
              tick={{ fill: "#687681", fontSize: 9 }}
              axisLine={{ stroke: "#27323a" }}
              tickLine={false}
            />
            <YAxis
              width={62}
              tickFormatter={(value) => compact(Number(value), series.unit)}
              tick={{ fill: "#687681", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="chart-tooltip">
                    <strong>{day(String(payload[0].payload.date))}</strong>
                    <span>
                      {series.name}:{" "}
                      {compact(Number(payload[0].payload.value), series.unit)}
                    </span>
                    <span>Quality: {String(payload[0].payload.quality)}</span>
                    <span>
                      Source: {series.canonical_source ?? series.source_type}
                    </span>
                  </div>
                ) : null
              }
            />
            {bars ? (
              <>
                <ReferenceLine y={0} stroke="#52606c" />
                <Bar dataKey="value" fill="#70aee8" isAnimationActive={false} />
              </>
            ) : (
              <Line
                type="linear"
                dataKey="value"
                stroke="#70aee8"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </Chart>
        </ResponsiveContainer>
      )}
      <footer className="chart-provenance">
        <span>Bron — {series.canonical_source ?? series.source_type}</span>
        <span>Frequentie — {series.expected_frequency}</span>
        <span>Type — {series.source_type}</span>
        <em>Ruwe reeks; geen smoothing of interpolatie.</em>
      </footer>
    </section>
  );
}

export function IndicatorSparkline({
  series,
  bars = false,
}: {
  series: IndicatorSeries;
  bars?: boolean;
}) {
  const data = series.points.slice(-90);
  if (!data.length) return <div className="spark-empty">NO DATA</div>;
  return (
    <ResponsiveContainer width="100%" height={70}>
      {bars ? (
        <BarChart data={data}>
          <ReferenceLine y={0} stroke="#52606c" />
          <Bar dataKey="value" fill="#70aee8" isAnimationActive={false} />
        </BarChart>
      ) : (
        <LineChart data={data}>
          <Line
            type="linear"
            dataKey="value"
            stroke="#70aee8"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
