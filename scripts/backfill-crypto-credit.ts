import { createClient } from "@supabase/supabase-js";
import { SupabaseIngestionRepository } from "../packages/database/src/ingestion-repository";
import {
  DefiLlamaLoansProvider,
  IngestionPipeline,
  SoSoValueEtfProvider,
} from "../packages/providers/src";
import {
  CRYPTO_CREDIT_CALCULATION_VERSION,
  deriveGrowth,
  deriveRollingSum,
  deriveStablecoinMetrics,
  type CalculationPoint,
  type DerivedMetric,
} from "../packages/signal-engine/src";

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
const repository = new SupabaseIngestionRepository(client);
const pipeline = new IngestionPipeline(repository);
const to = new Date();

const loanProvider = new DefiLlamaLoansProvider();
const loanFrom = new Date(to.getTime() - 180 * 86_400_000);
const loans = await loanProvider.fetchRange(
  "DEFI_ACTIVE_LOANS_USD",
  loanFrom,
  to,
);
const loanResult = await pipeline.ingest(
  loanProvider,
  "DEFI_ACTIVE_LOANS_USD",
  loans,
);
console.log(
  JSON.stringify({
    indicator: "DEFI_ACTIVE_LOANS_USD",
    ...loanResult,
  }),
);

const etfProvider = new SoSoValueEtfProvider(required("SOSOVALUE_API_KEY"));
const etfFrom = new Date(to.getTime() - 300 * 86_400_000);
for (const indicator of [
  "BTC_ETF_NET_FLOW_USD",
  "ETH_ETF_NET_FLOW_USD",
] as const) {
  const rows = await etfProvider.fetchRange(indicator, etfFrom, to);
  const result = await pipeline.ingest(etfProvider, indicator, rows);
  console.log(JSON.stringify({ indicator, ...result }));
}

async function canonical(code: string): Promise<CalculationPoint[]> {
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
      ...(data ?? []).map((row) => ({
        id: row.id as string,
        observedAt: new Date(row.observed_at as string),
        value: Number(row.value),
      })),
    );
    if (!data || data.length < 1000) break;
  }
  return rows;
}
const [stable, btcEtf, ethEtf, loanPoints] = await Promise.all([
  canonical("STABLECOIN_SUPPLY_USD"),
  canonical("BTC_ETF_NET_FLOW_USD"),
  canonical("ETH_ETF_NET_FLOW_USD"),
  canonical("DEFI_ACTIVE_LOANS_USD"),
]);
const metrics: DerivedMetric[] = [
  ...deriveStablecoinMetrics(stable),
  ...deriveRollingSum(btcEtf, "BTC_ETF_FLOW_20D_USD"),
  ...deriveRollingSum(ethEtf, "ETH_ETF_FLOW_20D_USD"),
  ...deriveGrowth(loanPoints, "DEFI_LOANS_GROWTH_30D_PERCENT", 30),
];
const codes = [...new Set(metrics.map((item) => item.code))];
const { data: indicators, error: indicatorError } = await client
  .from("indicators")
  .select("id,code")
  .in("code", codes);
if (indicatorError) throw indicatorError;
const ids = new Map(
  (indicators ?? []).map((row) => [row.code as string, row.id as string]),
);
let persisted = 0;
for (let offset = 0; offset < metrics.length; offset += 500) {
  const batch = metrics.slice(offset, offset + 500).map((item) => ({
    indicator_id: ids.get(item.code),
    calculated_at: item.calculatedAt.toISOString(),
    raw_value: item.value,
    normalized_value: null,
    trend: null,
    calculation_version: CRYPTO_CREDIT_CALCULATION_VERSION,
    input_observation_ids: item.inputObservationIds,
  }));
  if (batch.some((row) => !row.indicator_id))
    throw new Error("Derived indicator contract missing");
  const { error } = await client.from("indicator_snapshots").upsert(batch, {
    onConflict: "indicator_id,calculated_at,calculation_version",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  persisted += batch.length;
}
console.log(
  JSON.stringify({
    calculationVersion: CRYPTO_CREDIT_CALCULATION_VERSION,
    derivedCandidates: metrics.length,
    persisted,
  }),
);
