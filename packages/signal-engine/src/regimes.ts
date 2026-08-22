import type { AssetRegime, CryptoLiquidityRegime, MacroRegime, RegimeScore } from "@cmip/domain";
import { PHASE_THREE_CONFIG } from "./config";
import { aggregate, freshnessStatus, movingAverage, percentChange, scoreSymmetric, sumRecent, validSeries } from "./math";
import type { EngineIndicator, EngineObservation, FactorResult, FactorFamily, FactorTiming, ObservationSeries, PhaseThreeInput, PhaseThreeOutput, RegimeResult } from "./types";

const macroStates: Record<RegimeScore, MacroRegime> = { [-2]: "STRONGLY_RESTRICTIVE", [-1]: "RESTRICTIVE", 0: "NEUTRAL", 1: "SUPPORTIVE", 2: "STRONGLY_SUPPORTIVE" };
const cryptoStates: Record<RegimeScore, CryptoLiquidityRegime> = { [-2]: "STRONGLY_CONTRACTING", [-1]: "CONTRACTING", 0: "NEUTRAL", 1: "EXPANDING", 2: "STRONGLY_EXPANDING" };
const assetStates: Record<RegimeScore, AssetRegime> = { [-2]: "STRONGLY_NEGATIVE", [-1]: "NEGATIVE", 0: "NEUTRAL", 1: "POSITIVE", 2: "STRONGLY_POSITIVE" };

function factor(code: string, family: FactorFamily, timing: FactorTiming, indicator: EngineIndicator, series: ObservationSeries, asOf: Date, calculate: (items: EngineObservation[]) => { raw: number | null; score: RegimeScore | null }, description: string): FactorResult {
  const items = validSeries(series, indicator, asOf); const freshness = freshnessStatus(items, indicator, asOf);
  if (freshness !== "VALID") return { code, family, timing, score: null, rawValue: items.at(-1)?.value ?? null, description, status: freshness };
  const result = calculate(items); return { code, family, timing, score: result.score, rawValue: result.raw, description, status: result.score === null ? "INSUFFICIENT_HISTORY" : "VALID" };
}
function inverseChange(items: EngineObservation[], days: number, strong: number, moderate: number) { const raw = percentChange(items, days); return { raw, score: raw === null ? null : scoreSymmetric(-raw, strong, moderate) }; }
function directChange(items: EngineObservation[], days: number, strong: number, moderate: number) { const raw = percentChange(items, days); return { raw, score: raw === null ? null : scoreSymmetric(raw, strong, moderate) }; }
function result<T extends string>(factors: FactorResult[], minimumCoverage: number, states: Record<RegimeScore,T>): RegimeResult<T> {
  const combined = aggregate(factors, minimumCoverage);
  return { state: combined.score === null ? null : states[combined.score], score: combined.score, status: combined.score === null ? "INSUFFICIENT_DATA" : "AVAILABLE", coverage: combined.coverage, factors, warnings: factors.filter(item=>item.status!=="VALID").map(item=>`${item.code}:${item.status}`) };
}
function daily(items: EngineObservation[]) {
  const days = new Map<string, EngineObservation>(); for (const item of items) days.set(item.observedAt.toISOString().slice(0,10), item); return [...days.values()];
}
function etfFactor(indicator: "BTC_ETF_NET_FLOW_USD"|"ETH_ETF_NET_FLOW_USD", series: ObservationSeries, asOf: Date): FactorResult {
  const btc = indicator === "BTC_ETF_NET_FLOW_USD"; const fiveThreshold = btc ? PHASE_THREE_CONFIG.thresholds.btcEtf5dUsd : PHASE_THREE_CONFIG.thresholds.ethEtf5dUsd; const twentyThreshold = btc ? PHASE_THREE_CONFIG.thresholds.btcEtf20dUsd : PHASE_THREE_CONFIG.thresholds.ethEtf20dUsd;
  return factor(`${btc?"BTC":"ETH"}_ETF_FLOW`, "INSTITUTIONAL_FLOWS", "CONFIRMING", indicator, series, asOf, items => {
    const five = sumRecent(items, 5); const twenty = sumRecent(items, 20); if (five === null || twenty === null) return { raw: twenty, score: null };
    const short = scoreSymmetric(five, fiveThreshold, 1); const long = scoreSymmetric(twenty, twentyThreshold, 1); const average = (short+long)/2;
    const score: RegimeScore = average >= 1.5 ? 2 : average >= 0.5 ? 1 : average <= -1.5 ? -2 : average <= -0.5 ? -1 : 0; return { raw: twenty, score };
  }, "5-day and 20-day aggregate US spot ETF net flow");
}

export function evaluateMacro(input: PhaseThreeInput) {
  const t = PHASE_THREE_CONFIG.thresholds;
  const factors = [
    factor("DXY_30D", "MONETARY_CONDITIONS", "COINCIDENT", "DXY", input.observations, input.asOf, items=>inverseChange(items,30,t.dxy30dPercent[0],t.dxy30dPercent[1]), "Inverse 30-day DXY change"),
    factor("REAL_YIELD_30D", "MONETARY_CONDITIONS", "COINCIDENT", "US10Y_REAL", input.observations, input.asOf, items => { const raw = items.length<2?null:items.at(-1)!.value-(items.find(item=>item.observedAt.getTime()>=items.at(-1)!.observedAt.getTime()-30*86_400_000)?.value ?? items[0]!.value); return { raw, score: raw===null?null:scoreSymmetric(-raw,t.realYield30dPoints[0],t.realYield30dPoints[1]) }; }, "Inverse 30-day real-yield change in percentage points"),
    factor("US_NET_LIQUIDITY_30D", "LIQUIDITY", "LEADING", "US_NET_LIQUIDITY_USD", input.observations, input.asOf, items=>directChange(items,30,t.netLiquidity30dPercent[0],t.netLiquidity30dPercent[1]), "30-day US net-liquidity proxy change")
  ];
  return result(factors, PHASE_THREE_CONFIG.minimumCoverage.macro, macroStates);
}

export function evaluateCryptoLiquidity(input: PhaseThreeInput) {
  const t = PHASE_THREE_CONFIG.thresholds;
  const factors = [
    factor("STABLECOIN_SUPPLY_30D", "CRYPTO_NATIVE_LIQUIDITY", "LEADING", "STABLECOIN_SUPPLY_USD", input.observations, input.asOf, items=>directChange(items,30,t.stablecoin30dPercent[0],t.stablecoin30dPercent[1]), "30-day USD stablecoin supply change"),
    etfFactor("BTC_ETF_NET_FLOW_USD", input.observations, input.asOf), etfFactor("ETH_ETF_NET_FLOW_USD", input.observations, input.asOf)
  ];
  return result(factors, PHASE_THREE_CONFIG.minimumCoverage.cryptoLiquidity, cryptoStates);
}

function marketStructure(asset: "BTC"|"ETH", series: ObservationSeries, asOf: Date): FactorResult[] {
  const indicator = `${asset}_USD` as "BTC_USD"|"ETH_USD"; const t = PHASE_THREE_CONFIG.thresholds;
  const priceVs200 = factor(`${asset}_PRICE_VS_200DMA`, "ASSET_MARKET_STRUCTURE", "CONFIRMING", indicator, series, asOf, rawItems => { const items=daily(rawItems); const average=movingAverage(items,200); const raw=average===null?null:(items.at(-1)!.value-average)/average*100; return { raw, score:raw===null?null:scoreSymmetric(raw,t.priceVs200dStrongPercent,0.01) }; }, "Price distance from 200-day moving average");
  const slope = factor(`${asset}_50DMA_SLOPE`, "ASSET_MARKET_STRUCTURE", "CONFIRMING", indicator, series, asOf, rawItems => { const items=daily(rawItems); if(items.length<70)return {raw:null,score:null}; const current=movingAverage(items,50)!; const previous=items.slice(0,-20).slice(-50).reduce((sum,item)=>sum+item.value,0)/50; const raw=(current-previous)/previous*100; return {raw,score:scoreSymmetric(raw,t.movingAverageSlope20dStrongPercent,0.01)}; }, "20-day direction of the 50-day moving average");
  return [priceVs200, slope, etfFactor(`${asset}_ETF_NET_FLOW_USD` as "BTC_ETF_NET_FLOW_USD"|"ETH_ETF_NET_FLOW_USD", series, asOf)];
}

export function evaluateAsset(asset: "BTC"|"ETH", input: PhaseThreeInput) {
  const factors = marketStructure(asset,input.observations,input.asOf);
  if (asset === "ETH") {
    factors.push(factor("ETH_BTC_30D", "ASSET_MARKET_STRUCTURE", "CONFIRMING", "ETH_USD", input.observations, input.asOf, ethItems => { const btc=validSeries(input.observations,"BTC_USD",input.asOf); const eth=daily(ethItems); const btcDaily=daily(btc); const ratios=eth.flatMap(e=>{const b=btcDaily.find(item=>item.observedAt.toISOString().slice(0,10)===e.observedAt.toISOString().slice(0,10));return b?[{...e,value:e.value/b.value}]:[]}); return directChange(ratios,30,PHASE_THREE_CONFIG.thresholds.ethBtc30dStrongPercent,0.01); }, "30-day ETH/BTC relative trend"));
  }
  return result(factors, PHASE_THREE_CONFIG.minimumCoverage.asset, assetStates);
}

export function evaluateRegimes(input: PhaseThreeInput): PhaseThreeOutput {
  return { macro:evaluateMacro(input), cryptoLiquidity:evaluateCryptoLiquidity(input), assets:{BTC:evaluateAsset("BTC",input),ETH:evaluateAsset("ETH",input)}, configurationVersion:PHASE_THREE_CONFIG.version };
}
