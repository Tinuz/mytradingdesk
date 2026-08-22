import type { AssetRegime, ConfidenceLevel, CryptoCreditLiquidityRegime, CryptoLiquidityRegime, FactorClassification, FactorFamily as V3FactorFamily, InvestmentRegime, MacroLiquidityRegime, MacroRegime, MarketStructureRegime, ObservationQuality, RegimeScore } from "@cmip/domain";

export const ENGINE_INDICATORS = ["BTC_USD", "ETH_USD", "DXY", "US10Y_REAL", "STABLECOIN_SUPPLY_USD", "BTC_ETF_NET_FLOW_USD", "ETH_ETF_NET_FLOW_USD", "US_NET_LIQUIDITY_USD"] as const;
export type EngineIndicator = (typeof ENGINE_INDICATORS)[number];
export type FactorFamily = "MONETARY_CONDITIONS" | "LIQUIDITY" | "INSTITUTIONAL_FLOWS" | "CRYPTO_NATIVE_LIQUIDITY" | "ASSET_MARKET_STRUCTURE";
export type FactorTiming = "LEADING" | "CONFIRMING" | "COINCIDENT";

export const V3_ENGINE_INDICATORS = [
  "GLOBAL_LIQUIDITY_USD", "US_NET_LIQUIDITY_USD", "DXY", "US10Y_REAL",
  "STABLECOIN_SUPPLY_USD", "STABLECOIN_GROWTH_30D_PERCENT", "STABLECOIN_GROWTH_90D_PERCENT",
  "STABLECOIN_GROWTH_ACCELERATION_PP", "BTC_ETF_FLOW_20D_USD", "ETH_ETF_FLOW_20D_USD",
  "DEFI_ACTIVE_LOANS_USD", "DEFI_LOANS_GROWTH_30D_PERCENT", "BTC_MVRV",
  "BTC_PERPETUAL_OI_USD", "BTC_OI_MARKET_CAP_RATIO", "BTC_REALIZED_LOSSES_USD", "BTC_MARKET_CAP_USD",
  "BTC_USD", "ETH_USD", "ETH_BTC"
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
  code:string;family:V3FactorFamily;classification:FactorClassification;classificationStatus:"HYPOTHESIS"|"VALIDATED";
  score:RegimeScore|null;rawValue:number|null;description:string;status:"VALID"|"MISSING"|"STALE"|"INSUFFICIENT_HISTORY";
}

export interface V3RegimeOutput {
  macroLiquidity: RegimeResult<MacroLiquidityRegime,V3FactorResult>;
  cryptoCreditLiquidity: RegimeResult<CryptoCreditLiquidityRegime,V3FactorResult>;
  marketStructure: RegimeResult<MarketStructureRegime,V3FactorResult>;
  assets: { BTC: RegimeResult<AssetRegime,V3FactorResult>; ETH: RegimeResult<AssetRegime,V3FactorResult> };
  configurationVersion: "0.5.0-hypothesis.2";
}

export interface V3EngineObservation { indicator:V3EngineIndicator; observedAt:Date; value:number; quality:ObservationQuality }
export type V3ObservationSeries=Partial<Record<V3EngineIndicator,readonly V3EngineObservation[]>>;
export interface V3RegimeInput {asOf:Date;observations:V3ObservationSeries}

export interface V3TransitionMemory {currentState:InvestmentRegime|null;pendingState:InvestmentRegime|null;consecutiveObservations:number}
export interface V3ExplanationFact {code:string;regime:"MACRO_LIQUIDITY"|"CRYPTO_CREDIT_LIQUIDITY"|"MARKET_STRUCTURE"|"ASSET";score:RegimeScore;description:string}
export interface V3DecisionInput {
  macroLiquidity:RegimeResult<MacroLiquidityRegime,V3FactorResult>;
  cryptoCreditLiquidity:RegimeResult<CryptoCreditLiquidityRegime,V3FactorResult>;
  marketStructure:RegimeResult<MarketStructureRegime,V3FactorResult>;
  asset:RegimeResult<AssetRegime,V3FactorResult>;
  memory?:V3TransitionMemory;dataQualityIssues?:readonly DataQualityIssue[];
}
export interface V3DecisionOutput {state:InvestmentRegime|null;candidateState:InvestmentRegime|null;previousState:InvestmentRegime|null;status:"AVAILABLE"|"INSUFFICIENT_DATA";confidence:ConfidenceLevel;transitioned:boolean;transitionReason:"INITIAL"|"PERSISTENCE_CONFIRMED"|"PENDING_CONFIRMATION"|"HYSTERESIS_HELD"|"INSUFFICIENT_DATA";memory:V3TransitionMemory;riskOverride:"NONE"|"OVERHEAT_CAP"|"STRESS_CAP"|"CAPITULATION_CAP";explanationFacts:{positiveDrivers:readonly V3ExplanationFact[];negativeDrivers:readonly V3ExplanationFact[];riskDrivers:readonly V3ExplanationFact[];contradictorySignals:readonly V3ExplanationFact[];dataWarnings:readonly string[]};engineVersion:"0.6.0-hypothesis.1"}

export interface EngineObservation { indicator: EngineIndicator; observedAt: Date; value: number; quality: ObservationQuality }
export type ObservationSeries = Partial<Record<EngineIndicator, readonly EngineObservation[]>>;

export interface FactorResult {
  code: string; family: FactorFamily; timing: FactorTiming; score: RegimeScore | null;
  rawValue: number | null; description: string; status: "VALID" | "MISSING" | "STALE" | "INSUFFICIENT_HISTORY";
}

export interface RegimeResult<TState extends string,TFactor=FactorResult> {
  state: TState | null; score: RegimeScore | null; status: "AVAILABLE" | "INSUFFICIENT_DATA";
  coverage: number; factors: readonly TFactor[]; warnings: readonly string[];
}

export interface PhaseThreeInput { asOf: Date; observations: ObservationSeries }
export interface PhaseThreeOutput {
  macro: RegimeResult<MacroRegime>;
  cryptoLiquidity: RegimeResult<CryptoLiquidityRegime>;
  assets: { BTC: RegimeResult<AssetRegime>; ETH: RegimeResult<AssetRegime> };
  configurationVersion: string;
}

export type ShockType = "SYSTEMIC_STABLECOIN_FAILURE" | "MAJOR_EXCHANGE_INSOLVENCY" | "GOVERNMENT_PROHIBITION" | "EMERGENCY_CENTRAL_BANK_ACTION";
export interface TransitionMemory { currentState: InvestmentRegime | null; pendingState: InvestmentRegime | null; consecutiveObservations: number }
export interface DataQualityIssue { code: string; severity: "WARNING" | "CRITICAL" }
export interface ExplanationFact { code: string; regime: "MACRO" | "CRYPTO_LIQUIDITY" | "ASSET"; score: RegimeScore; description: string }
export interface DecisionInput {
  macro: RegimeResult<MacroRegime>;
  cryptoLiquidity: RegimeResult<CryptoLiquidityRegime>;
  asset: RegimeResult<AssetRegime>;
  memory?: TransitionMemory;
  shock?: ShockType;
  dataQualityIssues?: readonly DataQualityIssue[];
}
export interface DecisionOutput {
  state: InvestmentRegime | null;
  candidateState: InvestmentRegime | null;
  previousState: InvestmentRegime | null;
  status: "AVAILABLE" | "INSUFFICIENT_DATA";
  confidence: ConfidenceLevel;
  transitioned: boolean;
  transitionReason: "INITIAL" | "PERSISTENCE_CONFIRMED" | "PENDING_CONFIRMATION" | "HYSTERESIS_HELD" | "SHOCK_OVERRIDE" | "INSUFFICIENT_DATA";
  memory: TransitionMemory;
  explanationFacts: { positiveDrivers: readonly ExplanationFact[]; negativeDrivers: readonly ExplanationFact[]; contradictorySignals: readonly ExplanationFact[]; dataWarnings: readonly string[] };
  engineVersion: string;
}
