import { DATA_CONTRACTS } from "./contracts";
import { detectMissingIntervals } from "./gaps";
import { reconcile } from "./reconciliation";
import type {
  DataQualityEvent,
  HistoricalDataProvider,
  IngestionRepository,
  PhaseOneIndicator,
  ProviderObservation,
  StoredRawObservation,
} from "./types";
import { freshnessQuality, validateObservation } from "./validation";

export interface IngestionResult {
  received: number;
  valid: number;
  rejected: number;
  quarantined: number;
  canonicalInserted: number;
  duplicates: number;
}

export class IngestionPipeline {
  constructor(
    private readonly repository: IngestionRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async ingest(
    provider: HistoricalDataProvider,
    indicator: PhaseOneIndicator,
    observations: readonly ProviderObservation[],
  ): Promise<IngestionResult> {
    if (!provider.supportedIndicators.includes(indicator))
      throw new Error(`${provider.name} does not support ${indicator}`);
    const contract = DATA_CONTRACTS[indicator];
    const result: IngestionResult = {
      received: observations.length,
      valid: 0,
      rejected: 0,
      quarantined: 0,
      canonicalInserted: 0,
      duplicates: 0,
    };
    const ordered = [...observations].sort(
      (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
    );
    let previous = ordered[0]
      ? await this.repository.latestRawBefore(
          indicator,
          provider.name,
          ordered[0].observedAt,
        )
      : undefined;
    for (const candidate of ordered) {
      const validation = validateObservation(candidate, contract, previous);
      const stored = await this.repository.insertRaw({
        ...candidate,
        provider: provider.name,
        receivedAt: this.clock(),
        quality: validation.quality,
        validationReasons: validation.reasons,
      });
      if (!stored.inserted) {
        result.duplicates += 1;
        continue;
      }
      if (
        validation.quality === "REJECTED" ||
        validation.quality === "QUARANTINED"
      ) {
        result[
          validation.quality === "REJECTED" ? "rejected" : "quarantined"
        ] += 1;
        await this.repository.addQualityEvent(
          this.validationEvent(stored.observation),
        );
        continue;
      }
      previous = stored.observation;
      result.valid += 1;
      if (provider.name !== contract.canonicalProvider) continue;
      const comparison = await this.repository.rawAt(
        indicator,
        candidate.observedAt,
        provider.name,
      );
      const reconciliation = reconcile(
        stored.observation,
        comparison,
        contract,
      );
      if (reconciliation.status === "DISCREPANCY") {
        await this.repository.addQualityEvent({
          type: "PROVIDER_DISCREPANCY",
          indicator,
          provider: provider.name,
          severity: "WARNING",
          details: { ...reconciliation },
          occurredAt: this.clock(),
        });
      }
      const canonical = await this.repository.insertCanonical({
        indicator,
        observedAt: candidate.observedAt,
        value: candidate.value,
        unit: candidate.unit,
        quality: "VALID",
        provider: provider.name,
        sourceObservationId: stored.observation.id,
        reconciliation,
      });
      if (canonical.inserted) result.canonicalInserted += 1;
    }
    return result;
  }

  async fetchAndIngest(
    provider: HistoricalDataProvider,
    indicator: PhaseOneIndicator,
  ): Promise<IngestionResult> {
    const startedAt = this.clock();
    let observations: readonly ProviderObservation[];
    try {
      observations = await provider.fetchLatest(indicator);
      await this.repository.resolveQualityEvents(
        indicator,
        "PROVIDER_FAILURE",
        provider.name,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown provider error";
      await this.repository.addQualityEvent({
        type: "PROVIDER_FAILURE",
        indicator,
        provider: provider.name,
        severity: "CRITICAL",
        details: { message },
        occurredAt: this.clock(),
      });
      await this.repository.recordRun({
        provider: provider.name,
        indicator,
        jobType: "LATEST",
        startedAt,
        completedAt: this.clock(),
        status: "FAILED",
        received: 0,
        valid: 0,
        rejected: 0,
        quarantined: 0,
        error: message,
      });
      throw error;
    }
    try {
      const result = await this.ingest(provider, indicator, observations);
      if (result.valid > 0 && result.rejected === 0)
        await this.repository.resolveQualityEvents(
          indicator,
          "STRUCTURAL_ERROR",
          provider.name,
        );
      if (result.valid > 0 && result.quarantined === 0)
        await this.repository.resolveQualityEvents(
          indicator,
          "SEMANTIC_ANOMALY",
          provider.name,
        );
      await this.repository.recordRun({
        provider: provider.name,
        indicator,
        jobType: "LATEST",
        startedAt,
        completedAt: this.clock(),
        status: "SUCCEEDED",
        received: result.received,
        valid: result.valid,
        rejected: result.rejected,
        quarantined: result.quarantined,
      });
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown ingestion error";
      await this.repository.addQualityEvent({
        type: "INGESTION_FAILURE",
        indicator,
        provider: provider.name,
        severity: "CRITICAL",
        details: { message },
        occurredAt: this.clock(),
      });
      await this.repository.recordRun({
        provider: provider.name,
        indicator,
        jobType: "LATEST",
        startedAt,
        completedAt: this.clock(),
        status: "FAILED",
        received: observations.length,
        valid: 0,
        rejected: 0,
        quarantined: 0,
        error: message,
      });
      throw error;
    }
  }

  async evaluateFreshness(
    indicator: PhaseOneIndicator,
    provider: string,
  ): Promise<"VALID" | "STALE" | "UNKNOWN"> {
    const latest = await this.repository.latestRaw(indicator, provider);
    if (!latest) return "UNKNOWN";
    const quality = freshnessQuality(
      latest.observedAt,
      this.clock(),
      DATA_CONTRACTS[indicator],
    );
    if (quality === "STALE")
      await this.repository.addQualityEvent({
        type: "STALE",
        indicator,
        provider,
        severity: "WARNING",
        details: { observedAt: latest.observedAt.toISOString() },
        occurredAt: this.clock(),
      });
    return quality;
  }

  async recover(
    provider: HistoricalDataProvider,
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<{ missing: number; result: IngestionResult }> {
    if (!provider.supportsBackfill)
      throw new Error(`${provider.name} does not support backfill`);
    const contract = DATA_CONTRACTS[indicator];
    const existing = await this.repository.canonicalRange(indicator, from, to);
    const tradesContinuously =
      indicator === "BTC_USD" ||
      indicator === "ETH_USD" ||
      indicator === "STABLECOIN_SUPPLY_USD";
    const calendar = (date: Date) =>
      tradesContinuously || (date.getUTCDay() !== 0 && date.getUTCDay() !== 6);
    const alignment = contract.expectedAlignmentSeconds ?? 0;
    const gaps = detectMissingIntervals(
      from,
      to,
      contract.expectedIntervalSeconds,
      existing,
      calendar,
      alignment,
    );
    for (const gap of gaps)
      await this.repository.addQualityEvent({
        type: "MISSING_INTERVAL",
        indicator,
        provider: provider.name,
        severity: "WARNING",
        details: { from: gap.from.toISOString(), to: gap.to.toISOString() },
        occurredAt: this.clock(),
      });
    if (gaps.length === 0) {
      await this.repository.resolveQualityEvents(
        indicator,
        "MISSING_INTERVAL",
        provider.name,
      );
      return {
        missing: 0,
        result: {
          received: 0,
          valid: 0,
          rejected: 0,
          quarantined: 0,
          canonicalInserted: 0,
          duplicates: 0,
        },
      };
    }
    const startedAt = this.clock();
    try {
      const result = await this.ingest(
        provider,
        indicator,
        await provider.fetchRange(indicator, from, to),
      );
      const after = await this.repository.canonicalRange(indicator, from, to);
      if (
        detectMissingIntervals(
          from,
          to,
          contract.expectedIntervalSeconds,
          after,
          calendar,
          alignment,
        ).length === 0
      )
        await this.repository.resolveQualityEvents(
          indicator,
          "MISSING_INTERVAL",
          provider.name,
        );
      await this.repository.recordRun({
        provider: provider.name,
        indicator,
        jobType: "BACKFILL",
        startedAt,
        completedAt: this.clock(),
        status: "SUCCEEDED",
        received: result.received,
        valid: result.valid,
        rejected: result.rejected,
        quarantined: result.quarantined,
      });
      return { missing: gaps.length, result };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown provider error";
      await this.repository.addQualityEvent({
        type: "PROVIDER_FAILURE",
        indicator,
        provider: provider.name,
        severity: "CRITICAL",
        details: { message, jobType: "BACKFILL" },
        occurredAt: this.clock(),
      });
      await this.repository.recordRun({
        provider: provider.name,
        indicator,
        jobType: "BACKFILL",
        startedAt,
        completedAt: this.clock(),
        status: "FAILED",
        received: 0,
        valid: 0,
        rejected: 0,
        quarantined: 0,
        error: message,
      });
      throw error;
    }
  }

  private validationEvent(observation: StoredRawObservation): DataQualityEvent {
    return {
      type:
        observation.quality === "REJECTED"
          ? "STRUCTURAL_ERROR"
          : "SEMANTIC_ANOMALY",
      indicator: observation.indicator,
      provider: observation.provider,
      severity: observation.quality === "REJECTED" ? "CRITICAL" : "WARNING",
      details: {
        reasons: observation.validationReasons,
        providerReference: observation.providerReference,
      },
      occurredAt: this.clock(),
    };
  }
}
