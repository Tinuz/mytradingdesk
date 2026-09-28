import { createClient } from "@supabase/supabase-js";
import {
  evaluateV3Regimes,
  V3_ENGINE_INDICATORS,
  type RegimeResult,
  type V3EngineIndicator,
  type V3EngineObservation,
  type V3FactorResult,
  type V3ObservationSeries,
} from "../packages/signal-engine/src";
import type { ConfidenceLevel } from "@cmip/domain";
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
const asOf = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now());
const observations: Partial<Record<V3EngineIndicator, V3EngineObservation[]>> =
  {};
const freshness = new Map<V3EngineIndicator, number>();
const supported = new Set<string>(V3_ENGINE_INDICATORS);
for (let from = 0; ; from += 1000) {
  const { data, error } = await client
    .from("canonical_observations")
    .select(
      "observed_at,value,quality_status,indicators!inner(code,stale_after_seconds)",
    )
    .order("observed_at")
    .range(from, from + 999);
  if (error) throw error;
  for (const row of data ?? []) {
    const meta = row.indicators as unknown as {
      code: string;
      stale_after_seconds: number;
    };
    if (!supported.has(meta.code)) continue;
    const indicator = meta.code as V3EngineIndicator;
    const observedAt = new Date(row.observed_at as string);
    freshness.set(indicator, meta.stale_after_seconds);
    (observations[indicator] ??= []).push({
      indicator,
      observedAt,
      value: Number(row.value),
      quality: row.quality_status as V3EngineObservation["quality"],
    });
  }
  if (!data || data.length < 1000) break;
}
for (let from = 0; ; from += 1000) {
  const { data, error } = await client
    .from("indicator_snapshots")
    .select(
      "calculated_at,raw_value,indicators!inner(code,stale_after_seconds)",
    )
    .order("calculated_at")
    .range(from, from + 999);
  if (error) throw error;
  for (const row of data ?? []) {
    const meta = row.indicators as unknown as {
      code: string;
      stale_after_seconds: number;
    };
    if (!supported.has(meta.code) || row.raw_value === null) continue;
    const indicator = meta.code as V3EngineIndicator;
    const observedAt = new Date(row.calculated_at as string);
    freshness.set(indicator, meta.stale_after_seconds);
    (observations[indicator] ??= []).push({
      indicator,
      observedAt,
      value: Number(row.raw_value),
      quality: "VALID",
    });
  }
  if (!data || data.length < 1000) break;
}
for (const [code, rows] of Object.entries(observations) as [
  V3EngineIndicator,
  V3EngineObservation[],
][]) {
  rows.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const last = rows.at(-1),
    staleAfter = freshness.get(code);
  if (
    last &&
    staleAfter &&
    asOf.getTime() - last.observedAt.getTime() > staleAfter * 1000
  )
    last.quality = "STALE";
}
const output = evaluateV3Regimes({
  asOf,
  observations: observations as V3ObservationSeries,
});
const { data: assets, error: assetError } = await client
  .from("assets")
  .select("id,symbol")
  .in("symbol", ["BTC", "ETH"]);
if (assetError) throw assetError;
const assetIds = new Map(
  (assets ?? []).map((row) => [row.symbol as string, row.id as string]),
);
const confidence = (
  result: RegimeResult<string, V3FactorResult>,
): ConfidenceLevel =>
  result.status !== "AVAILABLE" || result.coverage < 0.67
    ? "LOW"
    : result.coverage === 1 && result.warnings.length === 0
      ? "HIGH"
      : "MEDIUM";
async function persist(
  regimeType:
    | "MACRO_LIQUIDITY"
    | "CRYPTO_CREDIT_LIQUIDITY"
    | "MARKET_STRUCTURE"
    | "ASSET",
  assetId: string | null,
  result: RegimeResult<string, V3FactorResult>,
) {
  if (result.status !== "AVAILABLE" || result.score === null || !result.state)
    return null;
  const row = {
    regime_type: regimeType,
    asset_id: assetId,
    calculated_at: asOf.toISOString(),
    regime_score: result.score,
    regime_state: result.state,
    confidence_level: confidence(result),
    factor_breakdown: {
      coverage: result.coverage,
      factors: result.factors,
      warnings: result.warnings,
    },
    engine_version: output.configurationVersion,
  };
  const { data, error } = await client
    .from("regime_snapshots")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
await Promise.all([
  persist("MACRO_LIQUIDITY", null, output.macroLiquidity),
  persist("CRYPTO_CREDIT_LIQUIDITY", null, output.cryptoCreditLiquidity),
  persist("MARKET_STRUCTURE", null, output.marketStructure),
  persist("ASSET", assetIds.get("BTC")!, output.assets.BTC),
  persist("ASSET", assetIds.get("ETH")!, output.assets.ETH),
]);
console.log(
  JSON.stringify(
    {
      asOf,
      engineVersion: output.configurationVersion,
      macro: output.macroLiquidity.state,
      cryptoCredit: output.cryptoCreditLiquidity.state,
      marketStructure: output.marketStructure.state,
      BTC: output.assets.BTC.state,
      ETH: output.assets.ETH.state,
      warnings: {
        macro: output.macroLiquidity.warnings,
        cryptoCredit: output.cryptoCreditLiquidity.warnings,
        marketStructure: output.marketStructure.warnings,
      },
    },
    null,
    2,
  ),
);
