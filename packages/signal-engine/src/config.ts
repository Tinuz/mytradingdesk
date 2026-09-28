import type { EngineIndicator } from "./types";
import type { InvestmentRegime, RegimeScore } from "@cmip/domain";

export const PHASE_THREE_CONFIG = {
  version: "0.3.0-hypothesis.1",
  assumptionStatus: "HYPOTHESIS",
  freshnessSeconds: {
    BTC_USD: 1_800,
    ETH_USD: 1_800,
    DXY: 14_400,
    US10Y_REAL: 345_600,
    STABLECOIN_SUPPLY_USD: 129_600,
    BTC_ETF_NET_FLOW_USD: 259_200,
    ETH_ETF_NET_FLOW_USD: 259_200,
    US_NET_LIQUIDITY_USD: 864_000,
  } satisfies Record<EngineIndicator, number>,
  thresholds: {
    dxy30dPercent: [3, 1],
    realYield30dPoints: [0.5, 0.15],
    netLiquidity30dPercent: [5, 1],
    stablecoin30dPercent: [2, 0.5],
    btcEtf5dUsd: 500_000_000,
    btcEtf20dUsd: 2_000_000_000,
    ethEtf5dUsd: 100_000_000,
    ethEtf20dUsd: 400_000_000,
    priceVs200dStrongPercent: 10,
    movingAverageSlope20dStrongPercent: 3,
    ethBtc30dStrongPercent: 5,
  },
  minimumCoverage: { macro: 0.5, cryptoLiquidity: 2 / 3, asset: 2 / 3 },
} as const;

export const PHASE_FOUR_CONFIG = {
  version: "0.4.0-hypothesis.1",
  assumptionStatus: "HYPOTHESIS",
  persistenceObservations: 2,
  hysteresis: {
    STRONG_ACCUMULATION: { enter: 5, exit: 3 },
    ACCUMULATION: { enter: 2, exit: 0 },
    NEUTRAL: { enter: 0, exit: 0 },
    RISK_REDUCTION: { enter: -2, exit: 0 },
    DEFENSIVE: { enter: -5, exit: -3 },
  },
  shockOverrides: {
    SYSTEMIC_STABLECOIN_FAILURE: "DEFENSIVE",
    MAJOR_EXCHANGE_INSOLVENCY: "DEFENSIVE",
    GOVERNMENT_PROHIBITION: "DEFENSIVE",
    EMERGENCY_CENTRAL_BANK_ACTION: "DEFENSIVE",
  },
} as const;

export function configuredDecision(
  macro: RegimeScore,
  crypto: RegimeScore,
  asset: RegimeScore,
): InvestmentRegime {
  if (macro === 2 && crypto === 2 && asset >= 1) return "STRONG_ACCUMULATION";
  if (macro === -2 && crypto <= -1 && asset <= -1) return "DEFENSIVE";
  const total = macro + crypto + asset;
  if (total >= 2 && macro >= 0 && crypto >= 0) return "ACCUMULATION";
  if (total <= -2 && macro <= 0 && crypto <= 0) return "RISK_REDUCTION";
  return "NEUTRAL";
}

export const DECISION_MATRIX: Readonly<Record<string, InvestmentRegime>> =
  Object.freeze(
    Object.fromEntries(
      ([-2, -1, 0, 1, 2] as RegimeScore[]).flatMap((macro) =>
        ([-2, -1, 0, 1, 2] as RegimeScore[]).flatMap((crypto) =>
          ([-2, -1, 0, 1, 2] as RegimeScore[]).map((asset) => [
            `${macro}:${crypto}:${asset}`,
            configuredDecision(macro, crypto, asset),
          ]),
        ),
      ),
    ),
  );
