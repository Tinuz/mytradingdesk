import { createClient } from "@supabase/supabase-js";
import {
  auditAvailability,
  type AvailabilityObservation,
  V3_ENGINE_INDICATORS,
} from "@cmip/signal-engine";
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
const started = new Date();
const { data: audit, error: auditError } = await client
  .from("point_in_time_audits")
  .insert({
    status: "RUNNING",
    started_at: started.toISOString(),
    policy_version: "availability-v1",
  })
  .select("id")
  .single();
if (auditError) throw new Error(`${auditError.code}: ${auditError.message}`);
try {
  const { data: policies, error: policyError } = await client
    .from("data_availability_policies")
    .select(
      "indicator_id,availability_basis,minimum_history,vintage_support,indicators!inner(code)",
    );
  if (policyError) throw policyError;
  const requiredCodes = new Set<string>(
    V3_ENGINE_INDICATORS.filter((code) => code !== "ETH_BTC"),
  );
  const results = [];
  let total = 0,
    late = 0,
    missing = 0,
    passed = 0;
  const blockers: string[] = [];
  const firstAvailability: Date[] = [];
  for (const policy of policies ?? []) {
    const code = (policy.indicators as unknown as { code: string }).code;
    if (!requiredCodes.has(code)) continue;
    const observations: AvailabilityObservation[] = [];
    if (policy.availability_basis === "CALCULATED_AT") {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client
          .from("indicator_snapshots")
          .select("calculated_at,created_at")
          .eq("indicator_id", policy.indicator_id)
          .order("calculated_at")
          .range(from, from + 999);
        if (error) throw error;
        observations.push(
          ...(data ?? []).map((row) => ({
            observedAt: new Date(row.calculated_at),
            availableAt: new Date(row.created_at),
          })),
        );
        if (!data || data.length < 1000) break;
      }
    } else {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client
          .from("canonical_observations")
          .select(
            "observed_at,raw_observations!canonical_observations_source_observation_id_fkey(received_at,published_at,revision_at)",
          )
          .eq("indicator_id", policy.indicator_id)
          .order("observed_at")
          .range(from, from + 999);
        if (error) throw error;
        for (const row of data ?? []) {
          const source = row.raw_observations as unknown as {
            received_at: string;
            published_at: string | null;
            revision_at: string | null;
          } | null;
          observations.push({
            observedAt: new Date(row.observed_at),
            availableAt: source ? new Date(source.received_at) : null,
            publishedAt: source?.published_at
              ? new Date(source.published_at)
              : null,
            revisionAt: source?.revision_at
              ? new Date(source.revision_at)
              : null,
          });
        }
        if (!data || data.length < 1000) break;
      }
    }
    const result = auditAvailability(observations);
    const available = observations
      .flatMap((x) => (x.availableAt ? [x.availableAt] : []))
      .sort((a, b) => a.getTime() - b.getTime());
    if (available[0]) firstAvailability.push(available[0]);
    const rowBlockers: string[] = [];
    let status: "PASSED" | "BLOCKED" | "MISSING" = "PASSED";
    if (!observations.length) {
      status = "MISSING";
      rowBlockers.push("NO_OBSERVATIONS");
    }
    if (result.missing) {
      status = "BLOCKED";
      rowBlockers.push(`MISSING_AVAILABILITY:${result.missing}`);
    }
    if (result.sameDay < policy.minimum_history)
      rowBlockers.push(
        `INSUFFICIENT_SAME_DAY_HISTORY:${result.sameDay}/${policy.minimum_history}`,
      );
    if (status === "PASSED") passed++;
    else blockers.push(`${code}:${rowBlockers.join(",")}`);
    total += result.total;
    late += result.late;
    missing += result.missing;
    results.push({
      audit_id: audit.id,
      indicator_id: policy.indicator_id,
      availability_basis: policy.availability_basis,
      minimum_history: policy.minimum_history,
      total_observations: result.total,
      proven_availability: result.proven,
      same_day_available: result.sameDay,
      late_observations: result.late,
      missing_availability: result.missing,
      published_timestamps: result.published,
      revision_timestamps: result.revisions,
      first_observed_at: observations.length
        ? new Date(
            Math.min(...observations.map((x) => x.observedAt.getTime())),
          ).toISOString()
        : null,
      last_observed_at: observations.length
        ? new Date(
            Math.max(...observations.map((x) => x.observedAt.getTime())),
          ).toISOString()
        : null,
      first_available_at: available[0]?.toISOString() ?? null,
      point_in_time_status: status,
      blockers: rowBlockers,
    });
  }
  if (results.length) {
    const { error } = await client
      .from("point_in_time_indicator_results")
      .insert(results);
    if (error) throw error;
  }
  const prospectiveStart = firstAvailability.length
    ? new Date(Math.max(...firstAvailability.map((x) => x.getTime())))
    : null;
  const prospectiveDays = prospectiveStart
    ? Math.max(
        0,
        Math.floor((Date.now() - prospectiveStart.getTime()) / 86_400_000),
      )
    : 0;
  if (prospectiveDays < 90)
    blockers.push(`PROSPECTIVE_WINDOW:${prospectiveDays}/90_DAYS`);
  const status = blockers.length ? "BLOCKED" : "PASSED";
  const summary = {
    prospectiveStart: prospectiveStart?.toISOString() ?? null,
    prospectiveDays,
    requiredProspectiveDays: 90,
    note: "Late backfills are valid for future evaluations after receipt, never for dates before receipt.",
  };
  const { error: finishError } = await client
    .from("point_in_time_audits")
    .update({
      status,
      completed_at: new Date().toISOString(),
      required_indicators: results.length,
      passed_indicators: passed,
      total_observations: total,
      late_observations: late,
      missing_availability: missing,
      blockers,
      summary,
    })
    .eq("id", audit.id);
  if (finishError) throw finishError;
  console.log(
    JSON.stringify(
      {
        auditId: audit.id,
        status,
        requiredIndicators: results.length,
        passedIndicators: passed,
        totalObservations: total,
        lateObservations: late,
        missingAvailability: missing,
        blockers,
        summary,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown availability audit failure";
  await client
    .from("point_in_time_audits")
    .update({
      status: "FAILED",
      completed_at: new Date().toISOString(),
      error: message,
    })
    .eq("id", audit.id);
  throw error;
}
