import { createClient } from "@supabase/supabase-js";
import { portfolioRisk } from "@cmip/signal-engine";
const req = (n: string) => {
    const v = process.env[n];
    if (!v) throw new Error(`${n} missing`);
    return v;
  },
  c = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  ),
  at = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now());
async function prices(code: string) {
  const { data } = await c
    .from("canonical_observations")
    .select("value,observed_at,indicators!inner(code)")
    .eq("indicators.code", code)
    .lte("observed_at", at.toISOString())
    .gte("observed_at", new Date(at.getTime() - 400 * 864e5).toISOString())
    .order("observed_at");
  const daily = new Map<string, number>();
  for (const x of data ?? [])
    daily.set(x.observed_at.slice(0, 10), Number(x.value));
  return daily;
}
const [b, e] = await Promise.all([prices("BTC_USD"), prices("ETH_USD")]),
  dates = [...b.keys()].filter((x) => e.has(x)).sort(),
  returns = dates.slice(1).flatMap((date, i) => {
    const prev = dates[i]!;
    return b.get(prev) && e.get(prev)
      ? [
          {
            date,
            btc: b.get(date)! / b.get(prev)! - 1,
            eth: e.get(date)! / e.get(prev)! - 1,
          },
        ]
      : [];
  }),
  { data: snapshots } = await c
    .from("portfolio_snapshots")
    .select("*")
    .lte("snapshot_at", at.toISOString())
    .order("snapshot_at", { ascending: false }),
  latest = new Map<string, NonNullable<typeof snapshots>[number]>();
for (const s of snapshots ?? [])
  if (!latest.has(s.user_id)) latest.set(s.user_id, s);
const out = [];
for (const s of latest.values()) {
  const positions = s.positions as Record<string, { value: number }>,
    total = Number(s.total_value),
    weights = {
      BTC: (positions.BTC?.value ?? 0) / total,
      ETH: (positions.ETH?.value ?? 0) / total,
      CASH: Number(s.cash_value) / total,
    },
    metrics = portfolioRisk(returns, weights),
    warnings =
      metrics.observations < 90 ? ["LESS_THAN_90_RETURN_OBSERVATIONS"] : [];
  const { error } = await c.from("portfolio_risk_snapshots").upsert(
    {
      user_id: s.user_id,
      portfolio_snapshot_id: s.id,
      calculated_at: at.toISOString(),
      methodology_version: "portfolio-risk-v1",
      metrics,
      binding_constraints: [],
      warnings,
    },
    {
      onConflict: "portfolio_snapshot_id,methodology_version",
      ignoreDuplicates: true,
    },
  );
  if (error) throw error;
  out.push({ user: s.user_id, metrics });
}
console.log(
  JSON.stringify(
    { calculatedAt: at.toISOString(), riskSnapshots: out },
    null,
    2,
  ),
);
