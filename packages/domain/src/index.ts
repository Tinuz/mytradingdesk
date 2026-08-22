export const REGIME_SCORES = [-2, -1, 0, 1, 2] as const;
export type RegimeScore = (typeof REGIME_SCORES)[number];

export const LIQUIDITY_REGIMES = [
  "STRONGLY_CONTRACTING", "CONTRACTING", "NEUTRAL", "EXPANDING", "STRONGLY_EXPANDING"
] as const;
export type LiquidityRegime = (typeof LIQUIDITY_REGIMES)[number];
export type MacroLiquidityRegime = LiquidityRegime;
export type CryptoCreditLiquidityRegime = LiquidityRegime;

/** @deprecated V2 replay only. New calculations use MacroLiquidityRegime. */
export type MacroRegime = "STRONGLY_RESTRICTIVE" | "RESTRICTIVE" | "NEUTRAL" | "SUPPORTIVE" | "STRONGLY_SUPPORTIVE";
/** @deprecated V2 replay only. New calculations use CryptoCreditLiquidityRegime. */
export type CryptoLiquidityRegime = LiquidityRegime;

export const MARKET_STRUCTURE_REGIMES = [
  "CAPITULATION", "STRESSED", "HEALTHY", "ELEVATED_RISK", "OVERHEATED"
] as const;
export type MarketStructureRegime = (typeof MARKET_STRUCTURE_REGIMES)[number];

export const ASSET_REGIMES = [
  "STRONGLY_NEGATIVE", "NEGATIVE", "NEUTRAL", "POSITIVE", "STRONGLY_POSITIVE"
] as const;
export type AssetRegime = (typeof ASSET_REGIMES)[number];

export const FACTOR_FAMILIES = [
  "GLOBAL_LIQUIDITY", "US_LIQUIDITY", "RATES_AND_DOLLAR", "STABLECOIN_LIQUIDITY",
  "ONCHAIN_CREDIT", "INSTITUTIONAL_FLOWS", "CAPITAL_MARKET_DEMAND",
  "DERIVATIVES_LEVERAGE", "MARKET_DEPTH", "ONCHAIN_VALUATION", "CAPITULATION",
  "ASSET_TREND"
] as const;
export type FactorFamily = (typeof FACTOR_FAMILIES)[number];

export const FACTOR_CLASSIFICATIONS = ["LEADING", "CONFIRMING", "RISK", "CONTEXT"] as const;
export type FactorClassification = (typeof FACTOR_CLASSIFICATIONS)[number];

export const CLASSIFICATION_STATUSES = ["HYPOTHESIS", "VALIDATED"] as const;
export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];

export const INVESTMENT_REGIMES = [
  "STRONG_ACCUMULATION", "ACCUMULATION", "NEUTRAL", "RISK_REDUCTION", "DEFENSIVE"
] as const;
export type InvestmentRegime = (typeof INVESTMENT_REGIMES)[number];

export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const OBSERVATION_QUALITY_STATES = [
  "VALID", "STALE", "SUSPECT", "QUARANTINED", "REJECTED"
] as const;
export type ObservationQuality = (typeof OBSERVATION_QUALITY_STATES)[number];

export const ASSET_SYMBOLS = ["BTC", "ETH"] as const;
export type AssetSymbol = (typeof ASSET_SYMBOLS)[number];

export const INVESTMENT_REGIME_LABELS_NL: Record<InvestmentRegime, string> = {
  STRONG_ACCUMULATION: "Sterk opbouwregime",
  ACCUMULATION: "Opbouwregime",
  NEUTRAL: "Neutraal",
  RISK_REDUCTION: "Risico verlagen",
  DEFENSIVE: "Defensief"
};
