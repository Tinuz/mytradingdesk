import { createClient } from "@supabase/supabase-js";
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
async function series(code: string, limit = 1) {
  const { data, error } = await c
    .from("canonical_observations")
    .select("id,value,observed_at,indicators!inner(code)")
    .eq("indicators.code", code)
    .lte("observed_at", at.toISOString())
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((x) => ({
    id: x.id,
    value: Number(x.value),
    at: x.observed_at,
  }));
}
const { data: assets, error: ae } = await c
  .from("assets")
  .select("id,symbol")
  .in("symbol", ["BTC", "ETH"]);
if (ae) throw ae;
const btc = (await series("BTC_USD"))[0],
  eth = (await series("ETH_USD"))[0],
  mvrv = (await series("BTC_MVRV"))[0];
if (!btc || !eth) throw new Error("Asset prices unavailable");
const rows = [];
for (const asset of assets ?? []) {
  if (asset.symbol === "BTC" && mvrv) {
    const realized = btc.value / mvrv.value;
    rows.push({
      asset_id: asset.id,
      calculated_at: at.toISOString(),
      methodology_version: "btc-mvrv-bands-v1-hypothesis",
      fair_value_low: realized,
      fair_value_base: realized * 1.8,
      fair_value_high: realized * 3,
      current_price: btc.value,
      components: {
        realizedPrice: realized,
        mvrv: mvrv.value,
        multiples: [1, 1.8, 3],
      },
      input_observation_ids: [btc.id, mvrv.id],
      evidence_status: "HYPOTHESIS",
      warnings: ["Cycle multiples are uncalibrated hypotheses"],
    });
    const history = await series("BTC_USD", 2500),
      daily = new Map<string, { id: string; value: number }>();
    for (const x of history) daily.set(x.at.slice(0, 10), x);
    const last = [...daily.values()].slice(0, 200);
    if (last.length === 200) {
      const mean = last.reduce((s, x) => s + x.value, 0) / last.length;
      rows.push({
        asset_id: asset.id,
        calculated_at: at.toISOString(),
        methodology_version: "btc-200dma-anchor-v1-hypothesis",
        fair_value_low: mean * 0.75,
        fair_value_base: mean,
        fair_value_high: mean * 1.5,
        current_price: btc.value,
        components: {
          dma200: mean,
          bands: [0.75, 1, 1.5],
          family: "MARKET_ANCHOR",
        },
        input_observation_ids: [btc.id, ...last.map((x) => x.id)],
        evidence_status: "HYPOTHESIS",
        warnings: [
          "Independent market anchor, not an on-chain intrinsic valuation family",
        ],
      });
    }
  } else if (asset.symbol === "ETH") {
    const history = await series("ETH_USD", 2500),
      daily = new Map<string, { id: string; value: number }>();
    for (const x of history) daily.set(x.at.slice(0, 10), x);
    const last = [...daily.values()].slice(0, 200),
      mean = last.reduce((s, x) => s + x.value, 0) / last.length;
    if (last.length < 200) continue;
    rows.push({
      asset_id: asset.id,
      calculated_at: at.toISOString(),
      methodology_version: "eth-200dma-anchor-v1-hypothesis",
      fair_value_low: mean * 0.8,
      fair_value_base: mean,
      fair_value_high: mean * 1.2,
      current_price: eth.value,
      components: { dma200: mean, bands: [0.8, 1, 1.2] },
      input_observation_ids: [eth.id, ...last.map((x) => x.id)],
      evidence_status: "HYPOTHESIS",
      warnings: ["Market anchor is not intrinsic protocol valuation"],
    });
  }
}
if (rows.length) {
  const { error } = await c.from("valuation_snapshots").upsert(rows, {
    onConflict: "asset_id,calculated_at,methodology_version",
    ignoreDuplicates: true,
  });
  if (error) throw error;
}
console.log(
  JSON.stringify(
    { calculatedAt: at.toISOString(), valuations: rows.length },
    null,
    2,
  ),
);
