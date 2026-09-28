import type {
  AssetRegime,
  ConfidenceLevel,
  CryptoCreditLiquidityRegime,
  FactorClassification,
  FactorFamily as V3FactorFamily,
  InvestmentRegime,
  MacroLiquidityRegime,
  MarketStructureRegime,
  ObservationQuality,
  RegimeScore,
} from "@cmip/domain";

export const V3_ENGINE_INDICATORS = [
  "GLOBAL_LIQUIDITY_USD",
  "US_NET_LIQUIDITY_USD",
  "DXY_PROXY_ECB",
  "US_BROAD_DOLLAR_INDEX",
  "US10Y_REAL",
  "STABLECOIN_SUPPLY_USD",
  "STABLECOIN_GROWTH_30D_PERCENT",
  "STABLECOIN_GROWTH_90D_PERCENT",
  "STABLECOIN_GROWTH_ACCELERATION_PP",
  "BTC_ETF_FLOW_20D_USD",
  "ETH_ETF_FLOW_20D_USD",
  "DEFI_ACTIVE_LOANS_USD",
  "DEFI_LOANS_GROWTH_30D_PERCENT",
  "BTC_MVRV",
  "BTC_PERPETUAL_OI_USD",
  "BTC_OI_MARKET_CAP_RATIO",
  "BTC_REALIZED_LOSSES_USD",
  "BTC_MARKET_CAP_USD",
  "BTC_USD",
  "ETH_USD",
  "ETH_BTC",
] as const;
export type V3EngineIndicator = (typeof V3_ENGINE_INDICATORS)[number];

export interface V3FactorDefinition {
  code: string;
  indicator: V3EngineIndicator;
  family: V3FactorFamily;
  classification: FactorClassification;
  classificationStatus: "HYPOTHESIS" | "VALIDATED";
}
export interface V3FactorResult {
  code: string;
  family: V3FactorFamily;
  classification: FactorClassification;
  classificationStatus: "HYPOTHESIS" | "VALIDATED";
  score: RegimeScore | null;
  rawValue: number | null;
  description: string;
  status: "VALID" | "MISSING" | "STALE" | "INSUFFICIENT_HISTORY";
}

export interface V3RegimeOutput {
  macroLiquidity: RegimeResult<MacroLiquidityRegime, V3FactorResult>;
  cryptoCreditLiquidity: RegimeResult<
    CryptoCreditLiquidityRegime,
    V3FactorResult
  >;
  marketStructure: RegimeResult<MarketStructureRegime, V3FactorResult>;
  assets: {
    BTC: RegimeResult<AssetRegime, V3FactorResult>;
    ETH: RegimeResult<AssetRegime, V3FactorResult>;
  };
  configurationVersion: "0.5.2-hypothesis.1";
}

export interface V3EngineObservation {
  indicator: V3EngineIndicator;
  observedAt: Date;
  value: number;
  quality: ObservationQuality;
}
export type V3ObservationSeries = Partial<
  Record<V3EngineIndicator, readonly V3EngineObservation[]>
>;
export interface V3RegimeInput {
  asOf: Date;
  observations: V3ObservationSeries;
}

export interface V3TransitionMemory {
  currentState: InvestmentRegime | null;
  pendingState: InvestmentRegime | null;
  consecutiveObservations: number;
}
export interface V3ExplanationFact {
  code: string;
  regime:
    | "MACRO_LIQUIDITY"
    | "CRYPTO_CREDIT_LIQUIDITY"
    | "MARKET_STRUCTURE"
    | "ASSET";
  score: RegimeScore;
  description: string;
}
export interface V3DecisionInput {
  macroLiquidity: RegimeResult<MacroLiquidityRegime, V3FactorResult>;
  cryptoCreditLiquidity: RegimeResult<
    CryptoCreditLiquidityRegime,
    V3FactorResult
  >;
  marketStructure: RegimeResult<MarketStructureRegime, V3FactorResult>;
  asset: RegimeResult<AssetRegime, V3FactorResult>;
  memory?: V3TransitionMemory;
  dataQualityIssues?: readonly DataQualityIssue[];
}
export interface V3DecisionOutput {
  /** Opportunity before market-structure risk governance is applied. */
  opportunityState: InvestmentRegime | null;
  opportunityScore: number | null;
  /** Market Structure remains an independent stress axis. */
  stressState: MarketStructureRegime | null;
  stressScore: RegimeScore | null;
  state: InvestmentRegime | null;
  candidateState: InvestmentRegime | null;
  previousState: InvestmentRegime | null;
  status: "AVAILABLE" | "INSUFFICIENT_DATA";
  confidence: ConfidenceLevel;
  transitioned: boolean;
  transitionReason:
    | "INITIAL"
    | "PERSISTENCE_CONFIRMED"
    | "PENDING_CONFIRMATION"
    | "HYSTERESIS_HELD"
    | "STRESS_CAP_APPLIED"
    | "INSUFFICIENT_DATA";
  memory: V3TransitionMemory;
  riskOverride: "NONE" | "OVERHEAT_CAP" | "STRESS_CAP" | "CAPITULATION_CAP";
  explanationFacts: {
    positiveDrivers: readonly V3ExplanationFact[];
    negativeDrivers: readonly V3ExplanationFact[];
    riskDrivers: readonly V3ExplanationFact[];
    contradictorySignals: readonly V3ExplanationFact[];
    dataWarnings: readonly string[];
  };
  engineVersion: "0.6.3-hypothesis.1";
}

export interface RegimeResult<TState extends string, TFactor = V3FactorResult> {
  state: TState | null;
  score: RegimeScore | null;
  status: "AVAILABLE" | "INSUFFICIENT_DATA";
  coverage: number;
  factors: readonly TFactor[];
  warnings: readonly string[];
}

export interface DataQualityIssue {
  code: string;
  severity: "WARNING" | "CRITICAL";
}
