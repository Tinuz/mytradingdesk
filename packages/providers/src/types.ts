import type { ObservationQuality } from "@cmip/domain";

export const PHASE_ONE_INDICATORS = [
  "BTC_USD",
  "ETH_USD",
  "EUR_USD",
  "DXY",
  "DXY_PROXY_ECB",
  "US_BROAD_DOLLAR_INDEX",
  "US10Y_REAL",
  "STABLECOIN_SUPPLY_USD",
  "BTC_ETF_NET_FLOW_USD",
  "ETH_ETF_NET_FLOW_USD",
  "US_NET_LIQUIDITY_USD",
  "GLOBAL_LIQUIDITY_USD",
  "DEFI_ACTIVE_LOANS_USD",
  "BTC_MVRV",
  "BTC_REALIZED_LOSSES_USD",
  "BTC_PERPETUAL_OI_USD",
  "BTC_MARKET_CAP_USD",
] as const;
export type PhaseOneIndicator = (typeof PHASE_ONE_INDICATORS)[number];
export type ProviderRole = "CANONICAL" | "FALLBACK" | "VALIDATION";

export interface ProviderObservation {
  indicator: PhaseOneIndicator;
  observedAt: Date;
  publishedAt?: Date;
  revisionAt?: Date;
  value: number;
  unit: string;
  providerReference: string;
  payload: unknown;
}

export interface HistoricalDataProvider {
  readonly name: string;
  readonly role: ProviderRole;
  readonly supportedIndicators: readonly PhaseOneIndicator[];
  readonly supportsBackfill: boolean;
  readonly expectedLatency: string;
  readonly rateLimit: string;
  fetchLatest(
    indicator: PhaseOneIndicator,
  ): Promise<readonly ProviderObservation[]>;
  fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]>;
}

export interface DataContract {
  indicator: PhaseOneIndicator;
  unit: string;
  minimum: number;
  maximum: number;
  maxPlausibleChangePercent: number;
  expectedIntervalSeconds: number;
  expectedAlignmentSeconds?: number;
  staleAfterSeconds: number;
  reconciliationTolerancePercent: number;
  canonicalProvider: string;
  fallbackProvider?: string;
}

export interface StoredRawObservation extends ProviderObservation {
  id: string;
  provider: string;
  receivedAt: Date;
  quality: ObservationQuality;
  validationReasons: readonly string[];
}

export interface CanonicalObservation {
  id: string;
  indicator: PhaseOneIndicator;
  observedAt: Date;
  value: number;
  unit: string;
  quality: ObservationQuality;
  provider: string;
  sourceObservationId: string;
  reconciliation: ReconciliationResult;
}

export interface ReconciliationResult {
  status: "NOT_COMPARED" | "MATCH" | "DISCREPANCY";
  differencePercent?: number;
  comparedProvider?: string;
}

export interface DataQualityEvent {
  type:
    | "STRUCTURAL_ERROR"
    | "SEMANTIC_ANOMALY"
    | "STALE"
    | "PROVIDER_DISCREPANCY"
    | "MISSING_INTERVAL"
    | "PROVIDER_FAILURE"
    | "INGESTION_FAILURE";
  indicator: PhaseOneIndicator;
  provider?: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  details: Readonly<Record<string, unknown>>;
  occurredAt: Date;
}

export interface IngestionRun {
  provider: string;
  indicator: PhaseOneIndicator;
  jobType: "LATEST" | "BACKFILL";
  startedAt: Date;
  completedAt: Date;
  status: "SUCCEEDED" | "FAILED";
  received: number;
  valid: number;
  rejected: number;
  quarantined: number;
  error?: string;
}

export interface IngestionRepository {
  insertRaw(
    observation: Omit<StoredRawObservation, "id">,
  ): Promise<{ observation: StoredRawObservation; inserted: boolean }>;
  insertCanonical(
    observation: Omit<CanonicalObservation, "id">,
  ): Promise<{ observation: CanonicalObservation; inserted: boolean }>;
  latestRaw(
    indicator: PhaseOneIndicator,
    provider: string,
  ): Promise<StoredRawObservation | undefined>;
  latestRawBefore(
    indicator: PhaseOneIndicator,
    provider: string,
    before: Date,
  ): Promise<StoredRawObservation | undefined>;
  rawAt(
    indicator: PhaseOneIndicator,
    observedAt: Date,
    excludingProvider: string,
  ): Promise<StoredRawObservation | undefined>;
  canonicalRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly CanonicalObservation[]>;
  addQualityEvent(event: DataQualityEvent): Promise<void>;
  recordRun(run: IngestionRun): Promise<void>;
  resolveQualityEvents(
    indicator: PhaseOneIndicator,
    type: DataQualityEvent["type"],
    provider: string,
  ): Promise<void>;
}
