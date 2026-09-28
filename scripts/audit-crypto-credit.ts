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
  "DEFI_ACTIVE_LOANS_USD",
  "STABLECOIN_GROWTH_30D_PERCENT",
  "STABLECOIN_GROWTH_90D_PERCENT",
  "STABLECOIN_GROWTH_ACCELERATION_PP",
  "BTC_ETF_FLOW_20D_USD",
  "ETH_ETF_FLOW_20D_USD",
  "DEFI_LOANS_GROWTH_30D_PERCENT",
]) {
  const base =
    code === "DEFI_ACTIVE_LOANS_USD"
      ? "canonical_observations"
      : "indicator_snapshots";
  const time =
    base === "canonical_observations" ? "observed_at" : "calculated_at";
  const { count, error } = await client
    .from(base)
    .select("id,indicators!inner(code)", { count: "exact", head: true })
    .eq("indicators.code", code);
  if (error) throw error;
  const { data, error: latestError } = await client
    .from(base)
    .select(`${time},indicators!inner(code)`)
    .eq("indicators.code", code)
    .order(time, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  const row = data as Record<string, unknown> | null;
  console.log(
    JSON.stringify({ code, store: base, count, latest: row?.[time] ?? null }),
  );
}
