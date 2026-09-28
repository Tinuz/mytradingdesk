import { createClient } from "@supabase/supabase-js";
import { V3_REGIME_CONFIG } from "@cmip/signal-engine";

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
const { data, error } = await client
  .from("dollar_strength_validation")
  .select("*")
  .order("observation_date", { ascending: false })
  .limit(90);
if (error) throw error;
const complete = (data ?? []).filter(
  (row) => row.direction_agreement_30d !== null,
);
const agreed = complete.filter((row) => row.direction_agreement_30d).length;
const { data: regime, error: regimeError } = await client
  .from("regime_snapshots")
  .select(
    "calculated_at,regime_state,regime_score,confidence_level,factor_breakdown",
  )
  .eq("regime_type", "MACRO_LIQUIDITY")
  .eq("engine_version", V3_REGIME_CONFIG.version)
  .order("calculated_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (regimeError) throw regimeError;
const dollarFactor = (
  regime?.factor_breakdown as { factors?: Array<{ code: string }> } | null
)?.factors?.find((factor) => factor.code === "DOLLAR_STRENGTH_ECB_90D");
console.log(
  JSON.stringify(
    {
      mode: "HYPOTHESIS_VALIDATION",
      officialDxyActivated: false,
      observations: data?.length ?? 0,
      comparable30d: complete.length,
      directionAgreementRate: complete.length ? agreed / complete.length : null,
      latest: data?.[0] ?? null,
      activeMacroSnapshot: regime
        ? {
            calculatedAt: regime.calculated_at,
            state: regime.regime_state,
            score: regime.regime_score,
            confidence: regime.confidence_level,
            dollarFactor: dollarFactor ?? null,
            warnings:
              (regime.factor_breakdown as { warnings?: string[] }).warnings ??
              [],
          }
        : null,
      promotionRule:
        "ACTIVE_HYPOTHESIS only; promotion to VALIDATED requires 90 prospective days, point-in-time evidence and reviewed threshold calibration.",
    },
    null,
    2,
  ),
);
