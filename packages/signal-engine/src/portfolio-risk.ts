export interface ReturnPoint {
  date: string;
  btc: number;
  eth: number;
}
export interface PositionWeights {
  BTC: number;
  ETH: number;
  CASH: number;
}
export interface PortfolioRisk {
  annualizedVolatility: number | null;
  maximumDrawdown: number | null;
  btcEthCorrelation: number | null;
  stressLossPercent: number;
  observations: number;
  betaToBtc: number | null;
  concentrationHhi: number;
  largestExposurePercent: number;
  liquidityRisk: "UNASSESSED";
}
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
export function portfolioRisk(
  points: readonly ReturnPoint[],
  weights: PositionWeights,
): PortfolioRisk {
  const returns = points.map((x) => weights.BTC * x.btc + weights.ETH * x.eth),
    observations = returns.length;
  if (observations < 2)
    return {
      annualizedVolatility: null,
      maximumDrawdown: null,
      btcEthCorrelation: null,
      stressLossPercent: weights.BTC * -50 + weights.ETH * -65,
      observations,
      betaToBtc: null,
      concentrationHhi: weights.BTC ** 2 + weights.ETH ** 2 + weights.CASH ** 2,
      largestExposurePercent:
        Math.max(weights.BTC, weights.ETH, weights.CASH) * 100,
      liquidityRisk: "UNASSESSED",
    };
  const avg = mean(returns),
    variance =
      returns.reduce((s, x) => s + (x - avg) ** 2, 0) / (returns.length - 1),
    annualizedVolatility = Math.sqrt(variance) * Math.sqrt(365) * 100;
  let nav = 1,
    peak = 1,
    maximumDrawdown = 0;
  for (const r of returns) {
    nav *= 1 + r;
    peak = Math.max(peak, nav);
    maximumDrawdown = Math.min(maximumDrawdown, nav / peak - 1);
  }
  const b = points.map((x) => x.btc),
    e = points.map((x) => x.eth),
    bm = mean(b),
    em = mean(e),
    cov =
      b.reduce((s, x, i) => s + (x - bm) * (e[i]! - em), 0) / (b.length - 1),
    bs = Math.sqrt(b.reduce((s, x) => s + (x - bm) ** 2, 0) / (b.length - 1)),
    es = Math.sqrt(e.reduce((s, x) => s + (x - em) ** 2, 0) / (e.length - 1));
  return {
    annualizedVolatility,
    maximumDrawdown: maximumDrawdown * 100,
    btcEthCorrelation: bs && es ? cov / (bs * es) : null,
    stressLossPercent: weights.BTC * -50 + weights.ETH * -65,
    observations,
    betaToBtc: bs
      ? (weights.BTC * bs * bs + weights.ETH * cov) / (bs * bs)
      : null,
    concentrationHhi: weights.BTC ** 2 + weights.ETH ** 2 + weights.CASH ** 2,
    largestExposurePercent:
      Math.max(weights.BTC, weights.ETH, weights.CASH) * 100,
    liquidityRisk: "UNASSESSED",
  };
}
