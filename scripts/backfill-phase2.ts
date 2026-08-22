import { createClient } from "@supabase/supabase-js";
import { SupabaseIngestionRepository } from "../packages/database/src/ingestion-repository";
import { DefiLlamaStablecoinProvider, FredGlobalLiquidityProvider, FredLiquidityProvider, IngestionPipeline, SoSoValueEtfProvider } from "../packages/providers/src";

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is missing`); return value; };
const repository = new SupabaseIngestionRepository(createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }));
const pipeline = new IngestionPipeline(repository);
const to = new Date();

for (const [provider, indicator, days] of [
  [new DefiLlamaStablecoinProvider(), "STABLECOIN_SUPPLY_USD", 180],
  [new FredLiquidityProvider(required("FRED_API_KEY")), "US_NET_LIQUIDITY_USD", 365]
] as const) {
  const from = new Date(to.getTime() - days * 86_400_000);
  const recovery = await pipeline.recover(provider, indicator, from, to);
  console.log(JSON.stringify({ indicator, provider: provider.name, rangeDays: days, ...recovery }));
}

// Monthly calendar periods are variable-length and cannot use the generic
// fixed-second gap detector. Fetch the full reconstructable range idempotently;
// provider/source uniqueness prevents duplicate canonical observations.
const globalProvider = new FredGlobalLiquidityProvider(required("FRED_API_KEY"));
const globalFrom = new Date(to.getTime() - 3650 * 86_400_000);
const globalObservations = await globalProvider.fetchRange("GLOBAL_LIQUIDITY_USD", globalFrom, to);
const globalResult = await pipeline.ingest(globalProvider, "GLOBAL_LIQUIDITY_USD", globalObservations);
console.log(JSON.stringify({ indicator:"GLOBAL_LIQUIDITY_USD", provider:globalProvider.name, rangeDays:3650, received:globalObservations.length, ...globalResult }));

if (process.env.SOSOVALUE_API_KEY && process.env.BACKFILL_ETF === "true") {
  const provider = new SoSoValueEtfProvider(process.env.SOSOVALUE_API_KEY);
  const from = new Date(to.getTime() - 300 * 86_400_000);
  for (const indicator of ["BTC_ETF_NET_FLOW_USD", "ETH_ETF_NET_FLOW_USD"] as const) {
    const observations = await provider.fetchRange(indicator, from, to);
    const result = await pipeline.ingest(provider, indicator, observations);
    console.log(JSON.stringify({ indicator, provider: provider.name, rangeDays: 300, result }));
  }
}
