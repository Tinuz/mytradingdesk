import { createClient } from "@supabase/supabase-js";
import {
  evaluateV3Decision,
  type RegimeResult,
  type V3FactorResult,
  type V3TransitionMemory,
} from "../packages/signal-engine/src";
import type {
  AssetRegime,
  CryptoCreditLiquidityRegime,
  InvestmentRegime,
  MacroLiquidityRegime,
  MarketStructureRegime,
  RegimeScore,
} from "@cmip/domain";
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
type Snapshot = {
  id: string;
  asset_id: string | null;
  regime_score: RegimeScore;
  regime_state: string;
  confidence_level: string;
  factor_breakdown: {
    coverage: number;
    factors: V3FactorResult[];
    warnings: string[];
  };
};
async function latest(type: string, assetId?: string) {
  let query = client
    .from("regime_snapshots")
    .select(
      "id,asset_id,regime_score,regime_state,confidence_level,factor_breakdown",
    )
    .eq("regime_type", type)
    .eq("engine_version", "0.5.1-hypothesis.1")
    .order("calculated_at", { ascending: false })
    .limit(1);
  query = assetId ? query.eq("asset_id", assetId) : query.is("asset_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${type} snapshot missing`);
  return data as Snapshot;
}
const regime = <T extends string>(
  row: Snapshot,
): RegimeResult<T, V3FactorResult> => ({
  state: row.regime_state as T,
  score: row.regime_score,
  status: "AVAILABLE",
  coverage: row.factor_breakdown.coverage,
  factors: row.factor_breakdown.factors,
  warnings: row.factor_breakdown.warnings,
});
const [macroRow, cryptoRow, marketRow] = await Promise.all([
  latest("MACRO_LIQUIDITY"),
  latest("CRYPTO_CREDIT_LIQUIDITY"),
  latest("MARKET_STRUCTURE"),
]);
const { data: assets, error: assetsError } = await client
  .from("assets")
  .select("id,symbol")
  .in("symbol", ["BTC", "ETH"]);
if (assetsError) throw assetsError;
const results = [];
for (const asset of assets ?? []) {
  const assetRow = await latest("ASSET", asset.id);
  const { data: previous, error: previousError } = await client
    .from("decision_snapshots")
    .select("decision_state,pending_state,consecutive_observations")
    .eq("asset_id", asset.id)
    .in("engine_version", ["0.6.2-hypothesis.1", "0.6.1-hypothesis.1"])
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw previousError;
  const memory: V3TransitionMemory | undefined = previous
    ? {
        currentState: previous.decision_state as InvestmentRegime,
        pendingState: previous.pending_state as InvestmentRegime | null,
        consecutiveObservations: Number(previous.consecutive_observations),
      }
    : undefined;
  const decision = evaluateV3Decision({
    macroLiquidity: regime<MacroLiquidityRegime>(macroRow),
    cryptoCreditLiquidity: regime<CryptoCreditLiquidityRegime>(cryptoRow),
    marketStructure: regime<MarketStructureRegime>(marketRow),
    asset: regime<AssetRegime>(assetRow),
    ...(memory ? { memory } : {}),
  });
  if (decision.status !== "AVAILABLE" || !decision.state)
    throw new Error(`${asset.symbol} decision unavailable`);
  const calculatedAt = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now());
  const { error } = await client.from("decision_snapshots").insert({
    asset_id: asset.id,
    calculated_at: calculatedAt.toISOString(),
    macro_regime_snapshot_id: macroRow.id,
    crypto_regime_snapshot_id: cryptoRow.id,
    market_structure_snapshot_id: marketRow.id,
    asset_regime_snapshot_id: assetRow.id,
    decision_state: decision.state,
    previous_state: decision.previousState,
    confidence_level: decision.confidence,
    engine_version: decision.engineVersion,
    explanation_facts: decision.explanationFacts,
    candidate_state: decision.candidateState,
    pending_state: decision.memory.pendingState,
    consecutive_observations: decision.memory.consecutiveObservations,
    transition_reason: decision.transitionReason,
    risk_override: decision.riskOverride,
    opportunity_state: decision.opportunityState,
    opportunity_score: decision.opportunityScore,
    stress_state: decision.stressState,
    stress_score: decision.stressScore,
  });
  if (error) throw error;
  results.push({
    asset: asset.symbol,
    state: decision.state,
    confidence: decision.confidence,
    riskOverride: decision.riskOverride,
    transitionReason: decision.transitionReason,
  });
}
console.log(
  JSON.stringify(
    { engineVersion: "0.6.2-hypothesis.1", decisions: results },
    null,
    2,
  ),
);
