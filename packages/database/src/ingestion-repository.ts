import type { CanonicalObservation, DataQualityEvent, IngestionRepository, IngestionRun, PhaseOneIndicator, StoredRawObservation } from "@cmip/providers";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export class SupabaseIngestionRepository implements IngestionRepository {
  private readonly providerIds = new Map<string,string>();
  private readonly indicatorIds = new Map<string,string>();
  constructor(private readonly client: SupabaseClient) {}

  async insertRaw(input: Omit<StoredRawObservation, "id">) {
    const [providerId, indicatorId] = await Promise.all([this.providerId(input.provider), this.indicatorId(input.indicator)]);
    const row = { provider_id: providerId, indicator_id: indicatorId, observed_at: input.observedAt.toISOString(), received_at: input.receivedAt.toISOString(), published_at: input.publishedAt?.toISOString() ?? null, revision_at: input.revisionAt?.toISOString() ?? null, raw_value: String(input.value), raw_payload: input.payload, provider_reference: input.providerReference, unit: input.unit, quality_status: input.quality, validation_reasons: input.validationReasons };
    const { data, error } = await this.client.from("raw_observations").upsert(row, { onConflict: "provider_id,indicator_id,observed_at,provider_reference", ignoreDuplicates: true }).select("*").maybeSingle();
    if (error) throw error;
    if (data) return { observation: this.rawFromRow(data as Row, input.provider, input.indicator), inserted: true };
    const { data: existing, error: readError } = await this.client.from("raw_observations").select("*").eq("provider_id", providerId).eq("indicator_id", indicatorId).eq("observed_at", input.observedAt.toISOString()).eq("provider_reference", input.providerReference).single();
    if (readError) throw readError;
    return { observation: this.rawFromRow(existing as Row, input.provider, input.indicator), inserted: false };
  }

  async insertCanonical(input: Omit<CanonicalObservation, "id">) {
    const [providerId, indicatorId] = await Promise.all([this.providerId(input.provider), this.indicatorId(input.indicator)]);
    const row = { indicator_id: indicatorId, observed_at: input.observedAt.toISOString(), value: input.value, unit: input.unit, quality_status: input.quality, canonical_provider_id: providerId, source_observation_id: input.sourceObservationId, reconciliation_metadata: input.reconciliation };
    const { data, error } = await this.client.from("canonical_observations").upsert(row, { onConflict: "source_observation_id", ignoreDuplicates: true }).select("*").maybeSingle();
    if (error) throw error;
    if (data) return { observation: this.canonicalFromRow(data as Row, input.provider, input.indicator), inserted: true };
    const { data: existing, error: readError } = await this.client.from("canonical_observations").select("*").eq("source_observation_id", input.sourceObservationId).single();
    if (readError) throw readError;
    return { observation: this.canonicalFromRow(existing as Row, input.provider, input.indicator), inserted: false };
  }

  async latestRaw(indicator: PhaseOneIndicator, provider: string) {
    const [providerId, indicatorId] = await Promise.all([this.providerId(provider), this.indicatorId(indicator)]);
    const { data, error } = await this.client.from("raw_observations").select("*").eq("provider_id", providerId).eq("indicator_id", indicatorId).order("observed_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? this.rawFromRow(data as Row, provider, indicator) : undefined;
  }

  async latestRawBefore(indicator: PhaseOneIndicator, provider: string, before: Date) {
    const [providerId, indicatorId] = await Promise.all([this.providerId(provider), this.indicatorId(indicator)]);
    const { data, error } = await this.client.from("raw_observations").select("*").eq("provider_id", providerId).eq("indicator_id", indicatorId).eq("quality_status", "VALID").lt("observed_at", before.toISOString()).order("observed_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? this.rawFromRow(data as Row, provider, indicator) : undefined;
  }

  async rawAt(indicator: PhaseOneIndicator, observedAt: Date, excludingProvider: string) {
    const [indicatorId, excludedId] = await Promise.all([this.indicatorId(indicator), this.providerId(excludingProvider)]);
    const { data, error } = await this.client.from("raw_observations").select("*, providers!inner(name)").eq("indicator_id", indicatorId).eq("observed_at", observedAt.toISOString()).eq("quality_status", "VALID").neq("provider_id", excludedId).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const row = data as Row;
    return this.rawFromRow(row, ((row.providers as Row).name as string), indicator);
  }

  async canonicalRange(indicator: PhaseOneIndicator, from: Date, to: Date) {
    const indicatorId = await this.indicatorId(indicator);
    const { data, error } = await this.client.from("canonical_observations").select("*, providers!canonical_provider_id(name)").eq("indicator_id", indicatorId).gte("observed_at", from.toISOString()).lte("observed_at", to.toISOString());
    if (error) throw error;
    return (data ?? []).map((item) => { const row = item as Row; return this.canonicalFromRow(row, ((row.providers as Row).name as string), indicator); });
  }

  async addQualityEvent(event: DataQualityEvent) {
    const [indicatorId, providerId] = await Promise.all([this.indicatorId(event.indicator), event.provider ? this.providerId(event.provider) : Promise.resolve(null)]);
    const { error } = await this.client.from("data_quality_events").insert({ indicator_id: indicatorId, provider_id: providerId, event_type: event.type, severity: event.severity, details: event.details, created_at: event.occurredAt.toISOString() });
    if (error) throw error;
  }

  async recordRun(run: IngestionRun) {
    const providerId = await this.providerId(run.provider);
    const { error } = await this.client.from("ingestion_runs").insert({ provider_id: providerId, job_type: `${run.jobType}:${run.indicator}`, started_at: run.startedAt.toISOString(), completed_at: run.completedAt.toISOString(), status: run.status, records_received: run.received, records_valid: run.valid, records_rejected: run.rejected, records_quarantined: run.quarantined, error: run.error ?? null });
    if (error) throw error;
  }

  async resolveQualityEvents(indicator: PhaseOneIndicator, type: DataQualityEvent["type"], provider: string) {
    const [indicatorId, providerId] = await Promise.all([this.indicatorId(indicator), this.providerId(provider)]);
    const { error } = await this.client.from("data_quality_events").update({ resolved_at: new Date().toISOString() }).eq("indicator_id", indicatorId).eq("provider_id", providerId).eq("event_type", type).is("resolved_at", null);
    if (error) throw error;
  }

  private async providerId(name: string) { const cached=this.providerIds.get(name);if(cached)return cached;const { data, error } = await this.client.from("providers").select("id").eq("name", name).single(); if (error) throw error;const id=data.id as string;this.providerIds.set(name,id);return id; }
  private async indicatorId(code: PhaseOneIndicator) { const cached=this.indicatorIds.get(code);if(cached)return cached;const { data, error } = await this.client.from("indicators").select("id").eq("code", code).single(); if (error) throw error;const id=data.id as string;this.indicatorIds.set(code,id);return id; }

  private rawFromRow(row: Row, provider: string, indicator: PhaseOneIndicator): StoredRawObservation {
    const dates = { ...(row.published_at ? { publishedAt: new Date(row.published_at as string) } : {}), ...(row.revision_at ? { revisionAt: new Date(row.revision_at as string) } : {}) };
    return { id: row.id as string, provider, indicator, observedAt: new Date(row.observed_at as string), receivedAt: new Date(row.received_at as string), value: Number(row.raw_value), unit: row.unit as string, providerReference: row.provider_reference as string, payload: row.raw_payload, quality: row.quality_status as StoredRawObservation["quality"], validationReasons: row.validation_reasons as string[], ...dates };
  }

  private canonicalFromRow(row: Row, provider: string, indicator: PhaseOneIndicator): CanonicalObservation {
    return { id: row.id as string, provider, indicator, observedAt: new Date(row.observed_at as string), value: Number(row.value), unit: row.unit as string, quality: row.quality_status as CanonicalObservation["quality"], sourceObservationId: row.source_observation_id as string, reconciliation: row.reconciliation_metadata as CanonicalObservation["reconciliation"] };
  }
}
