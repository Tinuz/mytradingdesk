import { createClient } from "@supabase/supabase-js";
import { calculationTime } from "./lib/runtime";
const req = (n: string) => {
    const v = process.env[n];
    if (!v) throw new Error(`${n} missing`);
    return v;
  },
  c = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  ),
  now = calculationTime(),
  protocol = "cas-shadow-protocol-v1";
const [{ data: v1 }, { data: papers }, { count: critical }] = await Promise.all(
    [
      c.from("v1_gate_latest").select("overall_status").maybeSingle(),
      c.from("paper_portfolios").select("id,started_at,status"),
      c
        .from("data_quality_events")
        .select("id", { count: "exact", head: true })
        .eq("severity", "CRITICAL")
        .is("resolved_at", null),
    ],
  ),
  oldest = (papers ?? []).reduce<Date | null>(
    (a, x) => (!a || new Date(x.started_at) < a ? new Date(x.started_at) : a),
    null,
  ),
  months = oldest ? (now.getTime() - oldest.getTime()) / (30.4375 * 864e5) : 0,
  { count: navCount } = await c
    .from("paper_nav")
    .select("id", { count: "exact", head: true }),
  gates = {
    v1Trust: v1?.overall_status === "PASSED",
    prospectiveMonths: months >= 6,
    criticalIntegrity: (critical ?? 0) === 0,
    paperEvidence: (navCount ?? 0) >= 180,
  },
  blockers = Object.entries(gates)
    .filter(([, ok]) => !ok)
    .map(([x]) => x),
  status = blockers.length ? "BLOCKED" : "PASSED";
// The table has no uniqueness constraint: skip if this calculation time was
// already assessed, so a re-run of the workflow adds nothing.
const { data: existing, error: existingError } = await c
  .from("capital_readiness_assessments")
  .select("id")
  .eq("assessed_at", now.toISOString())
  .eq("protocol_version", protocol)
  .limit(1)
  .maybeSingle();
if (existingError) throw existingError;
if (existing) {
  console.log(JSON.stringify({ status: "ALREADY_ASSESSED" }));
  process.exit(0);
}
const { error } = await c.from("capital_readiness_assessments").insert({
  assessed_at: now.toISOString(),
  protocol_version: protocol,
  status,
  gates,
  blockers,
  metrics: {
    prospectiveMonths: months,
    navDays: navCount ?? 0,
    criticalDefects: critical ?? 0,
  },
});
if (error) throw error;
console.log(JSON.stringify({ status, gates, blockers }, null, 2));
