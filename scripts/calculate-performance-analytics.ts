import { createClient } from "@supabase/supabase-js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing`);
  return value;
};
const db = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);
const pct = (a: number, b: number) => (b === 0 ? 0 : a / b - 1);
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return xs.length > 1
    ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
    : 0;
};
const { data: portfolios, error: pe } = await db
  .from("paper_portfolios")
  .select("id,started_at,status")
  .eq("status", "ACTIVE");
if (pe) throw pe;
const output = [];
for (const portfolio of portfolios ?? []) {
  const { data: rows, error } = await db
    .from("paper_nav")
    .select("calculated_at,nav,benchmark_nav,attribution")
    .eq("paper_portfolio_id", portfolio.id)
    .order("calculated_at");
  if (error) throw error;
  if (!rows || rows.length < 2) {
    output.push({
      id: portfolio.id,
      status: "INSUFFICIENT_SAMPLE",
      days: rows?.length ?? 0,
    });
    continue;
  }
  const { data: trades, error: tradeError } = await db
    .from("paper_trades")
    .select(
      "quantity,price,fee,slippage,recommendation_id,allocation_recommendations!inner(analyst_signoffs(action))",
    )
    .eq("paper_portfolio_id", portfolio.id)
    .gte("executed_at", rows[0].calculated_at)
    .lte("executed_at", rows.at(-1)!.calculated_at);
  if (tradeError) throw tradeError;
  const navs = rows.map((r) => Number(r.nav)),
    returns = navs.slice(1).map((v, i) => pct(v, navs[i]!)),
    down = returns.filter((x) => x < 0),
    annualReturn =
      (navs.at(-1)! / navs[0]!) **
        (365 /
          Math.max(
            1,
            (new Date(rows.at(-1)!.calculated_at).getTime() -
              new Date(rows[0]!.calculated_at).getTime()) /
              864e5,
          )) -
      1,
    vol = stdev(returns) * Math.sqrt(365),
    sharpe = vol ? annualReturn / vol : null,
    sortino = stdev(down)
      ? annualReturn / (stdev(down) * Math.sqrt(365))
      : null;
  let peak = navs[0]!,
    maxDrawdown = 0,
    recoveryDays: number | null = null,
    drawdownStart: number | null = null;
  navs.forEach((v, i) => {
    if (v >= peak) {
      peak = v;
      if (drawdownStart !== null && recoveryDays === null)
        recoveryDays = i - drawdownStart;
      drawdownStart = null;
    } else {
      if (drawdownStart === null) drawdownStart = i;
      maxDrawdown = Math.min(maxDrawdown, v / peak - 1);
    }
  });
  const last = rows.at(-1)!,
    benchmarks = last.benchmark_nav as Record<string, number | null>,
    benchmarkReturns = Object.fromEntries(
      Object.entries(benchmarks).map(([k, v]) => [
        k,
        v === null ? null : pct(Number(v), navs[0]!),
      ]),
    ),
    fees = (trades ?? []).reduce(
      (s, t) => s + Number(t.fee) + Number(t.slippage),
      0,
    ),
    turnover =
      (trades ?? []).reduce(
        (s, t) => s + Number(t.quantity) * Number(t.price),
        0,
      ) / navs[0]!,
    strategyReturn = pct(navs.at(-1)!, navs[0]!),
    staticReturn = Number(benchmarkReturns.BTC_ETH_60_40 ?? 0),
    cashBenchmarkReturn = Number(benchmarkReturns.BTC_CASH_50_50 ?? 0),
    humanOverrides = (trades ?? []).filter((t) =>
      (
        t.allocation_recommendations as unknown as {
          analyst_signoffs: Array<{ action: string }>;
        }
      )?.analyst_signoffs?.some((x) => x.action === "MODIFY"),
    ).length;
  const metrics = {
    sampleDays: rows.length,
    totalReturn: strategyReturn,
    timeWeightedReturn: strategyReturn,
    moneyWeightedReturn: strategyReturn,
    annualizedReturn: annualReturn,
    annualizedVolatility: vol,
    sharpe,
    sortino,
    maxDrawdown,
    recoveryDays,
    turnover,
    downsideCapture: null,
    benchmarkReturns,
    limitations: [
      "Sharpe/Sortino are descriptive and unstable with small samples",
      "TWR equals MWR while the preregistered paper portfolio has no external cash flows",
    ],
  };
  const attribution = {
    strategicAllocation: staticReturn,
    tacticalRegimeResidual: strategyReturn - staticReturn + fees / navs[0]!,
    valuation: null,
    assetSelection: null,
    humanOverrideCount: humanOverrides,
    costs: -fees / navs[0]!,
    cashDragRelativeToStatic: cashBenchmarkReturn - staticReturn,
    status: "RESIDUAL_ATTRIBUTION_UNTIL_FACTOR_SAMPLE_IS_SUFFICIENT",
  };
  const calibration = {
    sampleSize: rows.length,
    minimumPromotionSample: 180,
    eligibleForPromotion: rows.length >= 180,
    walkForward: true,
    overlappingSamples: false,
    falsePositiveRate: null,
  };
  const inserted = await db.from("performance_analytics").insert({
    paper_portfolio_id: portfolio.id,
    calculated_at: new Date().toISOString(),
    window_start: rows[0]!.calculated_at.slice(0, 10),
    window_end: last.calculated_at.slice(0, 10),
    metrics,
    attribution,
    calibration,
    methodology_version: "performance-v1-shadow",
  });
  if (inserted.error) throw inserted.error;
  output.push({ id: portfolio.id, status: "CALCULATED", days: rows.length });
}
console.log(JSON.stringify({ portfolios: output }, null, 2));
