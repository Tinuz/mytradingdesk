import { createClient } from "@supabase/supabase-js";
import {
  DATA_CONTRACTS,
  EcbDxyProxyProvider,
  FredBroadDollarProvider,
  validateObservation,
  type HistoricalDataProvider,
  type PhaseOneIndicator,
  type ProviderObservation,
} from "../packages/providers/src";

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

async function identifiers(provider: string, indicator: PhaseOneIndicator) {
  const [
    { data: providerRow, error: providerError },
    { data: indicatorRow, error: indicatorError },
  ] = await Promise.all([
    client.from("providers").select("id").eq("name", provider).single(),
    client.from("indicators").select("id").eq("code", indicator).single(),
  ]);
  if (providerError) throw providerError;
  if (indicatorError) throw indicatorError;
  return {
    providerId: providerRow.id as string,
    indicatorId: indicatorRow.id as string,
  };
}

async function bulkIngest(
  provider: HistoricalDataProvider,
  indicator: PhaseOneIndicator,
  observations: readonly ProviderObservation[],
) {
  const { providerId, indicatorId } = await identifiers(
    provider.name,
    indicator,
  );
  const ordered = [...observations].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  let previous: ProviderObservation | undefined;
  let valid = 0,
    quarantined = 0,
    rejected = 0,
    canonicalCandidates = 0;
  const receivedAt = new Date().toISOString();
  for (let offset = 0; offset < ordered.length; offset += 500) {
    const candidates = ordered.slice(offset, offset + 500);
    const validated = candidates.map((item) => {
      const result = validateObservation(
        item,
        DATA_CONTRACTS[indicator],
        previous,
      );
      if (result.quality === "VALID") {
        previous = item;
        valid += 1;
      } else if (result.quality === "QUARANTINED") quarantined += 1;
      else rejected += 1;
      return { item, result };
    });
    const { error: rawError } = await client.from("raw_observations").upsert(
      validated.map(({ item, result }) => ({
        provider_id: providerId,
        indicator_id: indicatorId,
        observed_at: item.observedAt.toISOString(),
        received_at: receivedAt,
        published_at: item.publishedAt?.toISOString() ?? null,
        revision_at: item.revisionAt?.toISOString() ?? null,
        raw_value: String(item.value),
        raw_payload: item.payload,
        provider_reference: item.providerReference,
        unit: item.unit,
        quality_status: result.quality,
        validation_reasons: result.reasons,
      })),
      {
        onConflict: "provider_id,indicator_id,observed_at,provider_reference",
        ignoreDuplicates: true,
      },
    );
    if (rawError) throw rawError;
    const references = candidates.map((item) => item.providerReference);
    const { data: raw, error: readError } = await client
      .from("raw_observations")
      .select("id,observed_at,raw_value,quality_status")
      .eq("provider_id", providerId)
      .eq("indicator_id", indicatorId)
      .in("provider_reference", references);
    if (readError) throw readError;
    const canonical = (raw ?? [])
      .filter((row) => row.quality_status === "VALID")
      .map((row) => ({
        indicator_id: indicatorId,
        observed_at: row.observed_at,
        value: Number(row.raw_value),
        unit: DATA_CONTRACTS[indicator].unit,
        quality_status: "VALID",
        canonical_provider_id: providerId,
        source_observation_id: row.id,
        reconciliation_metadata: {
          status: "NOT_COMPARED",
          mode: "SHADOW_VALIDATION",
        },
      }));
    if (canonical.length) {
      const { error } = await client
        .from("canonical_observations")
        .upsert(canonical, {
          onConflict: "source_observation_id",
          ignoreDuplicates: true,
        });
      if (error) throw error;
      canonicalCandidates += canonical.length;
    }
  }
  return {
    received: ordered.length,
    valid,
    quarantined,
    rejected,
    canonicalCandidates,
  };
}

const to = new Date(),
  from = new Date(to.getTime() - 10 * 365 * 86_400_000);
for (const [provider, indicator] of [
  [new EcbDxyProxyProvider(), "DXY_PROXY_ECB"],
  [
    new FredBroadDollarProvider(required("FRED_API_KEY")),
    "US_BROAD_DOLLAR_INDEX",
  ],
] as const) {
  const result = await bulkIngest(
    provider,
    indicator,
    await provider.fetchRange(indicator, from, to),
  );
  console.log(
    JSON.stringify({
      indicator,
      provider: provider.name,
      mode: "SHADOW_VALIDATION",
      from: from.toISOString(),
      to: to.toISOString(),
      ...result,
    }),
  );
}
