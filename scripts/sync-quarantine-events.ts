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
const { data: rows, error } = await client
  .from("raw_observations")
  .select(
    "indicator_id,provider_id,provider_reference,quality_status,validation_reasons",
  )
  .in("quality_status", ["QUARANTINED", "REJECTED"]);
if (error) throw error;
let inserted = 0;
for (const row of rows ?? []) {
  const eventType =
    row.quality_status === "REJECTED" ? "STRUCTURAL_ERROR" : "SEMANTIC_ANOMALY";
  const { data: existing, error: findError } = await client
    .from("data_quality_events")
    .select("id")
    .eq("indicator_id", row.indicator_id)
    .eq("provider_id", row.provider_id)
    .eq("event_type", eventType)
    .contains("details", { providerReference: row.provider_reference })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) continue;
  const { error: insertError } = await client
    .from("data_quality_events")
    .insert({
      indicator_id: row.indicator_id,
      provider_id: row.provider_id,
      event_type: eventType,
      severity: row.quality_status === "REJECTED" ? "CRITICAL" : "WARNING",
      details: {
        reasons: row.validation_reasons,
        providerReference: row.provider_reference,
      },
    });
  if (insertError) throw insertError;
  inserted++;
}
console.log(
  JSON.stringify({
    invalidRawObservations: rows?.length ?? 0,
    qualityEventsInserted: inserted,
  }),
);
