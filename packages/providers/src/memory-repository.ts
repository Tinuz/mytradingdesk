import type { CanonicalObservation, DataQualityEvent, IngestionRepository, IngestionRun, PhaseOneIndicator, StoredRawObservation } from "./types";

export class MemoryIngestionRepository implements IngestionRepository {
  readonly raw: StoredRawObservation[] = [];
  readonly canonical: CanonicalObservation[] = [];
  readonly events: DataQualityEvent[] = [];
  readonly runs: IngestionRun[] = [];
  readonly resolvedEvents: Array<{ indicator: PhaseOneIndicator; type: DataQualityEvent["type"]; provider: string }> = [];
  private sequence = 0;

  async insertRaw(input: Omit<StoredRawObservation, "id">) {
    const existing = this.raw.find((item) => item.provider === input.provider && item.indicator === input.indicator && item.observedAt.getTime() === input.observedAt.getTime() && item.providerReference === input.providerReference);
    if (existing) return { observation: existing, inserted: false };
    const observation = { ...input, id: `raw-${++this.sequence}` };
    this.raw.push(observation);
    return { observation, inserted: true };
  }

  async insertCanonical(input: Omit<CanonicalObservation, "id">) {
    const existing = this.canonical.find((item) => item.indicator === input.indicator && item.observedAt.getTime() === input.observedAt.getTime() && item.sourceObservationId === input.sourceObservationId);
    if (existing) return { observation: existing, inserted: false };
    const observation = { ...input, id: `canonical-${++this.sequence}` };
    this.canonical.push(observation);
    return { observation, inserted: true };
  }

  async latestRaw(indicator: PhaseOneIndicator, provider: string) {
    return this.raw.filter((item) => item.indicator === indicator && item.provider === provider).sort((a,b) => b.observedAt.getTime()-a.observedAt.getTime())[0];
  }
  async latestRawBefore(indicator: PhaseOneIndicator, provider: string, before: Date) {
    return this.raw.filter(item => item.indicator === indicator && item.provider === provider && item.observedAt < before && item.quality === "VALID").sort((a,b)=>b.observedAt.getTime()-a.observedAt.getTime())[0];
  }
  async rawAt(indicator: PhaseOneIndicator, observedAt: Date, excludingProvider: string) {
    return this.raw.find((item) => item.indicator === indicator && item.provider !== excludingProvider && item.observedAt.getTime() === observedAt.getTime() && item.quality === "VALID");
  }
  async canonicalRange(indicator: PhaseOneIndicator, from: Date, to: Date) {
    return this.canonical.filter((item) => item.indicator === indicator && item.observedAt >= from && item.observedAt <= to);
  }
  async addQualityEvent(event: DataQualityEvent) { this.events.push(event); }
  async recordRun(run: IngestionRun) { this.runs.push(run); }
  async resolveQualityEvents(indicator: PhaseOneIndicator, type: DataQualityEvent["type"], provider: string) { this.resolvedEvents.push({ indicator, type, provider }); }
}
