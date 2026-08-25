import { createClient } from "@supabase/supabase-js";
const req = (n: string) => {
    const v = process.env[n];
    if (!v) throw new Error(`${n} missing`);
    return v;
  },
  db = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  ),
  now = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now()),
  horizons = [1, 7, 30, 90, 180];
async function prices(code: string, from: string, to: string) {
  const { data, error } = await db
    .from("canonical_observations")
    .select("id,value,observed_at,indicators!inner(code)")
    .eq("indicators.code", code)
    .gte("observed_at", from)
    .lte("observed_at", to)
    .order("observed_at");
  if (error) throw error;
  return (data ?? []).map((x) => ({
    id: x.id,
    value: Number(x.value),
    at: x.observed_at,
  }));
}
const { data: recommendations, error } = await db
  .from("allocation_recommendations")
  .select("id,user_id,calculated_at,target_ranges")
  .order("calculated_at");
if (error) throw error;
let written = 0;
for (const r of recommendations ?? [])
  for (const days of horizons) {
    const due = new Date(new Date(r.calculated_at).getTime() + days * 864e5);
    if (due > now) continue;
    const from = new Date(
        new Date(r.calculated_at).getTime() - 2 * 864e5,
      ).toISOString(),
      to = new Date(due.getTime() + 2 * 864e5).toISOString(),
      [btc, eth] = await Promise.all([
        prices("BTC_USD", from, to),
        prices("ETH_USD", from, to),
      ]),
      baseB = btc.filter((x) => x.at <= r.calculated_at).at(-1),
      baseE = eth.filter((x) => x.at <= r.calculated_at).at(-1),
      endB = btc.find((x) => x.at >= due.toISOString()),
      endE = eth.find((x) => x.at >= due.toISOString());
    if (!baseB || !baseE || !endB || !endE) continue;
    const b = endB.value / baseB.value - 1,
      e = endE.value / baseE.value - 1,
      targets = r.target_ranges as Record<string, { midpoint: number }>,
      wb = Number(targets.BTC?.midpoint ?? 0) / 100,
      we = Number(targets.ETH?.midpoint ?? 0) / 100,
      portfolio = (wb * b + we * e) * 100,
      pathDates = [
        ...new Set([
          ...btc.map((x) => x.at.slice(0, 10)),
          ...eth.map((x) => x.at.slice(0, 10)),
        ]),
      ].sort(),
      path = pathDates.map((date) => {
        const bp =
            btc.filter((x) => x.at.slice(0, 10) <= date).at(-1)?.value ??
            baseB.value,
          ep =
            eth.filter((x) => x.at.slice(0, 10) <= date).at(-1)?.value ??
            baseE.value;
        return (
          (wb * (bp / baseB.value - 1) + we * (ep / baseE.value - 1)) * 100
        );
      }),
      insert = await db.from("recommendation_outcomes").upsert(
        {
          recommendation_id: r.id,
          horizon_days: days,
          observed_at: due.toISOString(),
          asset_returns: { BTC: b * 100, ETH: e * 100 },
          portfolio_return_percent: portfolio,
          benchmark_return_percent: b * 100,
          adverse_excursion_percent: Math.min(...path),
          favorable_excursion_percent: Math.max(...path),
          outcome_status: "OBSERVED",
          price_observation_ids: [baseB.id, baseE.id, endB.id, endE.id],
          calculation_version: "recommendation-outcome-v1",
        },
        {
          onConflict: "recommendation_id,horizon_days,calculation_version",
          ignoreDuplicates: true,
        },
      );
    if (insert.error) throw insert.error;
    written++;
  }
console.log(
  JSON.stringify(
    { calculatedAt: now.toISOString(), outcomes: written },
    null,
    2,
  ),
);
