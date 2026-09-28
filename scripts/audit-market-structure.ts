import { createClient } from "@supabase/supabase-js";
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
for (const code of [
  "BTC_MVRV",
  "BTC_REALIZED_LOSSES_USD",
  "BTC_MARKET_CAP_USD",
  "BTC_PERPETUAL_OI_USD",
  "BTC_OI_MARKET_CAP_RATIO",
  "BTC_OI_DRAWDOWN_FROM_HIGH_PERCENT",
]) {
  const derived = code.startsWith("BTC_OI_");
  const table = derived ? "indicator_snapshots" : "canonical_observations";
  const column = derived ? "calculated_at" : "observed_at";
  const valueColumn = derived ? "raw_value" : "value";
  const { count, error } = await client
    .from(table)
    .select("id,indicators!inner(code)", { count: "exact", head: true })
    .eq("indicators.code", code);
  if (error) throw error;
  const { data, error: latestError } = await client
    .from(table)
    .select(`${column},${valueColumn},indicators!inner(code)`)
    .eq("indicators.code", code)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  console.log(
    JSON.stringify({
      code,
      count,
      latest: data?.[column] ?? null,
      value: data?.[valueColumn] ?? null,
    }),
  );
}
const { count: openQuality, error: qualityError } = await client
  .from("data_quality_events")
  .select("id,indicators!inner(code)", { count: "exact", head: true })
  .eq("indicators.code", "BTC_REALIZED_LOSSES_USD")
  .is("resolved_at", null);
if (qualityError) throw qualityError;
console.log(
  JSON.stringify({
    code: "BTC_REALIZED_LOSSES_USD",
    openQualityEvents: openQuality,
  }),
);
