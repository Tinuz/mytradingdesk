import { createClient } from "@supabase/supabase-js";
import type { ConfidenceLevel, InvestmentRegime } from "@cmip/domain";
import {
  evaluateDecision,
  evaluateRegimes,
  type EngineIndicator,
  type EngineObservation,
  type RegimeResult,
  type TransitionMemory,
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

async function allCanonical() {
  const rows: Array<{
    observed_at: string;
    value: number;
    quality_status: EngineObservation["quality"];
    indicators: unknown;
  }> = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await client
      .from("canonical_observations")
      .select("observed_at,value,quality_status,indicators!inner(code)")
      .order("observed_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as typeof rows));
    if (!data || data.length < 1_000) break;
  }
  return rows;
}
function regimeConfidence(result: RegimeResult<string>): ConfidenceLevel {
  return result.status !== "AVAILABLE" || result.coverage < 2 / 3
    ? "LOW"
    : result.coverage === 1 && result.warnings.length === 0
      ? "HIGH"
      : "MEDIUM";
}

const rows = await allCanonical();
const observations: Partial<Record<EngineIndicator, EngineObservation[]>> = {};
for (const row of rows) {
  const indicator = (row.indicators as { code: EngineIndicator }).code;
  const item: EngineObservation = {
    indicator,
    observedAt: new Date(row.observed_at),
    value: Number(row.value),
    quality: row.quality_status,
  };
  (observations[indicator] ??= []).push(item);
}
const calculatedAt = new Date(
  Math.max(...rows.map((row) => new Date(row.observed_at).getTime())),
);
const regimes = evaluateRegimes({ asOf: calculatedAt, observations });
const { data: assets, error: assetError } = await client
  .from("assets")
  .select("id,symbol")
  .in("symbol", ["BTC", "ETH"]);
if (assetError) throw assetError;

async function snapshot(
  regimeType: "MACRO" | "CRYPTO_LIQUIDITY" | "ASSET",
  assetId: string | null,
  result: RegimeResult<string>,
) {
  if (
    result.status !== "AVAILABLE" ||
    result.score === null ||
    result.state === null
  )
    throw new Error(
      `${regimeType} regime is unavailable; snapshot persistence blocked`,
    );
  let query = client
    .from("regime_snapshots")
    .select("id")
    .eq("regime_type", regimeType)
    .eq("calculated_at", calculatedAt.toISOString())
    .eq("engine_version", regimes.configurationVersion);
  query = assetId ? query.eq("asset_id", assetId) : query.is("asset_id", null);
  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id as string;
  const { data, error } = await client
    .from("regime_snapshots")
    .insert({
      regime_type: regimeType,
      asset_id: assetId,
      calculated_at: calculatedAt.toISOString(),
      regime_score: result.score,
      regime_state: result.state,
      confidence_level: regimeConfidence(result),
      factor_breakdown: {
        coverage: result.coverage,
        factors: result.factors,
        warnings: result.warnings,
      },
      engine_version: regimes.configurationVersion,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const macroId = await snapshot("MACRO", null, regimes.macro);
const cryptoId = await snapshot(
  "CRYPTO_LIQUIDITY",
  null,
  regimes.cryptoLiquidity,
);
const summaries = [];
for (const asset of assets ?? []) {
  const symbol = asset.symbol as "BTC" | "ETH";
  const assetResult = regimes.assets[symbol];
  const assetRegimeId = await snapshot("ASSET", asset.id, assetResult);
  const { data: previous, error: previousError } = await client
    .from("decision_snapshots")
    .select("decision_state,pending_state,consecutive_observations")
    .eq("asset_id", asset.id)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw previousError;
  const memory: TransitionMemory | undefined = previous
    ? {
        currentState: previous.decision_state as InvestmentRegime,
        pendingState: previous.pending_state as InvestmentRegime | null,
        consecutiveObservations: Number(previous.consecutive_observations),
      }
    : undefined;
  const decision = evaluateDecision({
    macro: regimes.macro,
    cryptoLiquidity: regimes.cryptoLiquidity,
    asset: assetResult,
    ...(memory ? { memory } : {}),
  });
  if (decision.status !== "AVAILABLE" || decision.state === null)
    throw new Error(`${symbol} decision is unavailable; persistence blocked`);
  const { data: existing, error: existingError } = await client
    .from("decision_snapshots")
    .select("id")
    .eq("asset_id", asset.id)
    .eq("calculated_at", calculatedAt.toISOString())
    .eq("engine_version", decision.engineVersion)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) {
    const { error } = await client.from("decision_snapshots").insert({
      asset_id: asset.id,
      calculated_at: calculatedAt.toISOString(),
      macro_regime_snapshot_id: macroId,
      crypto_regime_snapshot_id: cryptoId,
      asset_regime_snapshot_id: assetRegimeId,
      decision_state: decision.state,
      previous_state: decision.previousState,
      confidence_level: decision.confidence,
      engine_version: decision.engineVersion,
      explanation_facts: decision.explanationFacts,
      candidate_state: decision.candidateState,
      pending_state: decision.memory.pendingState,
      consecutive_observations: decision.memory.consecutiveObservations,
      transition_reason: decision.transitionReason,
    });
    if (error) throw error;
  }
  summaries.push({
    asset: symbol,
    state: decision.state,
    confidence: decision.confidence,
    transitionReason: decision.transitionReason,
  });
}
console.log(
  JSON.stringify(
    {
      calculatedAt,
      regimes: {
        macro: regimes.macro.state,
        cryptoLiquidity: regimes.cryptoLiquidity.state,
      },
      decisions: summaries,
    },
    null,
    2,
  ),
);
