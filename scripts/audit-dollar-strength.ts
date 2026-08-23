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
console.log(
  JSON.stringify(
    {
      mode: "SHADOW_VALIDATION",
      officialDxyActivated: false,
      observations: data?.length ?? 0,
      comparable30d: complete.length,
      directionAgreementRate: complete.length ? agreed / complete.length : null,
      latest: data?.[0] ?? null,
      activationRule:
        "No automatic activation; requires reviewed thresholds, point-in-time evidence and explicit provider decision.",
    },
    null,
    2,
  ),
);
