import { createClient } from "@supabase/supabase-js";
import {
  CRYPTO_CREDIT_CALCULATION_VERSION,
  deriveGrowth,
  deriveOiDrawdown,
  deriveOiMarketCapRatio,
  deriveRollingSum,
  deriveStablecoinMetrics,
  MARKET_STRUCTURE_CALCULATION_VERSION,
  type CalculationPoint,
  type DerivedMetric,
} from "@cmip/signal-engine";
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
};
const client = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function points(code: string) {
  const rows: CalculationPoint[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("canonical_observations")
      .select("id,observed_at,value,indicators!inner(code)")
      .eq("indicators.code", code)
      .eq("quality_status", "VALID")
      .order("observed_at")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(
      ...(data ?? []).map((x) => ({
        id: x.id,
        observedAt: new Date(x.observed_at),
        value: Number(x.value),
      })),
    );
    if (!data || data.length < 1000) break;
  }
  return rows;
}
const [stable, btcEtf, ethEtf, loans, oi, marketCap] = await Promise.all([
  points("STABLECOIN_SUPPLY_USD"),
  points("BTC_ETF_NET_FLOW_USD"),
  points("ETH_ETF_NET_FLOW_USD"),
  points("DEFI_ACTIVE_LOANS_USD"),
  points("BTC_PERPETUAL_OI_USD"),
  points("BTC_MARKET_CAP_USD"),
]);
const crypto: DerivedMetric[] = [
  ...deriveStablecoinMetrics(stable),
  ...deriveRollingSum(btcEtf, "BTC_ETF_FLOW_20D_USD"),
  ...deriveRollingSum(ethEtf, "ETH_ETF_FLOW_20D_USD"),
  ...deriveGrowth(loans, "DEFI_LOANS_GROWTH_30D_PERCENT", 30),
];
const market: DerivedMetric[] = [
  ...deriveOiMarketCapRatio(oi, marketCap),
  ...deriveOiDrawdown(oi),
];
let inserted = 0;
for (const [metrics, version] of [
  [crypto, CRYPTO_CREDIT_CALCULATION_VERSION],
  [market, MARKET_STRUCTURE_CALCULATION_VERSION],
] as const) {
  const codes = [...new Set(metrics.map((x) => x.code))];
  const { data: indicators, error } = await client
    .from("indicators")
    .select("id,code")
    .in("code", codes);
  if (error) throw error;
  const ids = new Map((indicators ?? []).map((x) => [x.code, x.id]));
  for (let offset = 0; offset < metrics.length; offset += 500) {
    const rows = metrics.slice(offset, offset + 500).map((x) => ({
      indicator_id: ids.get(x.code),
      calculated_at: x.calculatedAt.toISOString(),
      raw_value: x.value,
      normalized_value: null,
      trend: null,
      calculation_version: version,
      input_observation_ids: x.inputObservationIds,
    }));
    const { error: writeError } = await client
      .from("indicator_snapshots")
      .upsert(rows, {
        onConflict: "indicator_id,calculated_at,calculation_version",
        ignoreDuplicates: true,
      });
    if (writeError) throw writeError;
    inserted += rows.length;
  }
}
console.log(
  JSON.stringify({
    derivedCandidates: crypto.length + market.length,
    processed: inserted,
    versions: [
      CRYPTO_CREDIT_CALCULATION_VERSION,
      MARKET_STRUCTURE_CALCULATION_VERSION,
    ],
  }),
);
