import { createClient } from "@supabase/supabase-js";
import {
  BGeometricsProvider,
  CoinalyzeOpenInterestProvider,
  DATA_CONTRACTS,
  validateObservation,
  type PhaseOneIndicator,
  type ProviderObservation,
} from "../packages/providers/src";
import {
  deriveOiDrawdown,
  deriveOiMarketCapRatio,
  MARKET_STRUCTURE_CALCULATION_VERSION,
  type CalculationPoint,
  type DerivedMetric,
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
async function ids(provider: string, indicator: PhaseOneIndicator) {
  const [{ data: p, error: pe }, { data: i, error: ie }] = await Promise.all([
    client.from("providers").select("id").eq("name", provider).single(),
    client.from("indicators").select("id").eq("code", indicator).single(),
  ]);
  if (pe) throw pe;
  if (ie) throw ie;
  return { providerId: p.id as string, indicatorId: i.id as string };
}
async function bulk(
  provider: string,
  indicator: PhaseOneIndicator,
  observations: readonly ProviderObservation[],
) {
  const { providerId, indicatorId } = await ids(provider, indicator);
  const ordered = [...observations].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  let previous: ProviderObservation | undefined;
  let valid = 0,
    quarantined = 0,
    rejected = 0,
    canonical = 0;
  for (let offset = 0; offset < ordered.length; offset += 250) {
    const candidates = ordered.slice(offset, offset + 250);
    const validated = candidates.map((item) => {
      const result = validateObservation(
        item,
        DATA_CONTRACTS[indicator],
        previous,
      );
      if (result.quality === "VALID") {
        previous = item;
        valid++;
      } else if (result.quality === "QUARANTINED") quarantined++;
      else rejected++;
      return { item, result };
    });
    const rawRows = validated.map(({ item, result }) => ({
      provider_id: providerId,
      indicator_id: indicatorId,
      observed_at: item.observedAt.toISOString(),
      received_at: new Date().toISOString(),
      published_at: item.publishedAt?.toISOString() ?? null,
      revision_at: item.revisionAt?.toISOString() ?? null,
      raw_value: String(item.value),
      raw_payload: item.payload,
      provider_reference: item.providerReference,
      unit: item.unit,
      quality_status: result.quality,
      validation_reasons: result.reasons,
    }));
    const { error: rawError } = await client
      .from("raw_observations")
      .upsert(rawRows, {
        onConflict: "provider_id,indicator_id,observed_at,provider_reference",
        ignoreDuplicates: true,
      });
    if (rawError) throw rawError;
    for (const { item, result } of validated.filter(
      (row) => row.result.quality !== "VALID",
    )) {
      const details = {
        reasons: result.reasons,
        providerReference: item.providerReference,
      };
      const { data: existing, error: findError } = await client
        .from("data_quality_events")
        .select("id")
        .eq("indicator_id", indicatorId)
        .eq("provider_id", providerId)
        .eq(
          "event_type",
          result.quality === "REJECTED"
            ? "STRUCTURAL_ERROR"
            : "SEMANTIC_ANOMALY",
        )
        .contains("details", { providerReference: item.providerReference })
        .limit(1)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) {
        const { error } = await client.from("data_quality_events").insert({
          indicator_id: indicatorId,
          provider_id: providerId,
          event_type:
            result.quality === "REJECTED"
              ? "STRUCTURAL_ERROR"
              : "SEMANTIC_ANOMALY",
          severity: result.quality === "REJECTED" ? "CRITICAL" : "WARNING",
          details,
        });
        if (error) throw error;
      }
    }
    const refs = candidates.map((item) => item.providerReference);
    const { data: raw, error: readError } = await client
      .from("raw_observations")
      .select("id,observed_at,raw_value,quality_status,provider_reference")
      .eq("provider_id", providerId)
      .eq("indicator_id", indicatorId)
      .in("provider_reference", refs);
    if (readError) throw readError;
    const canonicalRows = (raw ?? [])
      .filter((row) => row.quality_status === "VALID")
      .map((row) => ({
        indicator_id: indicatorId,
        observed_at: row.observed_at,
        value: Number(row.raw_value),
        unit: DATA_CONTRACTS[indicator].unit,
        quality_status: "VALID",
        canonical_provider_id: providerId,
        source_observation_id: row.id,
        reconciliation_metadata: { status: "NOT_COMPARED" },
      }));
    if (canonicalRows.length) {
      const { error } = await client
        .from("canonical_observations")
        .upsert(canonicalRows, {
          onConflict: "source_observation_id",
          ignoreDuplicates: true,
        });
      if (error) throw error;
      canonical += canonicalRows.length;
    }
  }
  console.log(
    JSON.stringify({
      indicator,
      provider,
      received: ordered.length,
      valid,
      quarantined,
      rejected,
      canonicalCandidates: canonical,
    }),
  );
}
const to = new Date();
const from = new Date(to.getTime() - 4 * 365 * 86_400_000);
const bg = new BGeometricsProvider();
for (const indicator of [
  "BTC_MVRV",
  "BTC_REALIZED_LOSSES_USD",
  "BTC_MARKET_CAP_USD",
] as const)
  await bulk(bg.name, indicator, await bg.fetchRange(indicator, from, to));
const oiProvider = new CoinalyzeOpenInterestProvider(
  required("COINALYZE_API_KEY"),
);
await bulk(
  oiProvider.name,
  "BTC_PERPETUAL_OI_USD",
  await oiProvider.fetchRange("BTC_PERPETUAL_OI_USD", from, to),
);
async function canonicalPoints(code: string): Promise<CalculationPoint[]> {
  const rows: CalculationPoint[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("canonical_observations")
      .select("id,observed_at,value,indicators!inner(code)")
      .eq("indicators.code", code)
      .eq("quality_status", "VALID")
      .order("observed_at")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(
      ...(data ?? []).map((row) => ({
        id: row.id as string,
        observedAt: new Date(row.observed_at as string),
        value: Number(row.value),
      })),
    );
    if (!data || data.length < 1000) break;
  }
  return rows;
}
const [oi, cap] = await Promise.all([
  canonicalPoints("BTC_PERPETUAL_OI_USD"),
  canonicalPoints("BTC_MARKET_CAP_USD"),
]);
const metrics: DerivedMetric[] = [
  ...deriveOiMarketCapRatio(oi, cap),
  ...deriveOiDrawdown(oi),
];
const codes = [...new Set(metrics.map((item) => item.code))];
const { data: indicators, error: indicatorError } = await client
  .from("indicators")
  .select("id,code")
  .in("code", codes);
if (indicatorError) throw indicatorError;
const indicatorIds = new Map(
  (indicators ?? []).map((row) => [row.code as string, row.id as string]),
);
for (let offset = 0; offset < metrics.length; offset += 500) {
  const rows = metrics.slice(offset, offset + 500).map((item) => ({
    indicator_id: indicatorIds.get(item.code),
    calculated_at: item.calculatedAt.toISOString(),
    raw_value: item.value,
    normalized_value: null,
    trend: null,
    calculation_version: MARKET_STRUCTURE_CALCULATION_VERSION,
    input_observation_ids: item.inputObservationIds,
  }));
  const { error } = await client.from("indicator_snapshots").upsert(rows, {
    onConflict: "indicator_id,calculated_at,calculation_version",
    ignoreDuplicates: true,
  });
  if (error) throw error;
}
console.log(
  JSON.stringify({
    calculationVersion: MARKET_STRUCTURE_CALCULATION_VERSION,
    derivedCandidates: metrics.length,
  }),
);
