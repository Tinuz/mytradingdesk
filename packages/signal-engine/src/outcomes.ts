export { RECOMMENDATION_OUTCOME_VERSION } from "@cmip/domain";
export const OUTCOME_HORIZON_DAYS = [1, 7, 30, 90, 180] as const;
/** How long after the horizon a first price may arrive and still count. */
const END_TOLERANCE_MS = 2 * 86_400_000;

export interface ObservedPrice {
  id: string;
  observedAt: Date;
  value: number;
}
export interface RecommendationOutcome {
  observedAt: Date;
  assetReturnsPercent: { BTC: number; ETH: number };
  portfolioReturnPercent: number;
  adverseExcursionPercent: number;
  favorableExcursionPercent: number;
  priceObservationIds: string[];
}

function lastAtOrBefore(rows: readonly ObservedPrice[], time: number) {
  let found: ObservedPrice | undefined;
  for (const row of rows) {
    if (row.observedAt.getTime() > time) break;
    found = row;
  }
  return found;
}
const firstAtOrAfter = (rows: readonly ObservedPrice[], time: number) =>
  rows.find((x) => x.observedAt.getTime() >= time);

/**
 * Forward outcome of a recommendation's target weights over one horizon.
 *
 * Prices must be VALID observations in ascending order. The entry price is the
 * last one known at recommendation time; the exit price is the first one at or
 * after the horizon (within two days). Excursions are measured only along the
 * holding period (entry, exit], relative to entry, and include the flat
 * starting point, so a purely rising path has an adverse excursion of 0.
 */
export function recommendationOutcome(input: {
  calculatedAt: Date;
  horizonDays: number;
  weightsPercent: { BTC: number; ETH: number };
  btc: readonly ObservedPrice[];
  eth: readonly ObservedPrice[];
}): RecommendationOutcome | null {
  const start = input.calculatedAt.getTime();
  const due = start + input.horizonDays * 86_400_000;
  const baseB = lastAtOrBefore(input.btc, start);
  const baseE = lastAtOrBefore(input.eth, start);
  const endB = firstAtOrAfter(input.btc, due);
  const endE = firstAtOrAfter(input.eth, due);
  if (!baseB || !baseE || !endB || !endE) return null;
  const endAt = Math.max(endB.observedAt.getTime(), endE.observedAt.getTime());
  if (endAt > due + END_TOLERANCE_MS) return null;

  const wb = input.weightsPercent.BTC / 100;
  const we = input.weightsPercent.ETH / 100;
  const portfolio = (btc: number, eth: number) =>
    (wb * (btc / baseB.value - 1) + we * (eth / baseE.value - 1)) * 100;

  // Walk both series in time order, forward-filling the other asset.
  const events = [
    ...input.btc.map((x) => ({ asset: "BTC" as const, x })),
    ...input.eth.map((x) => ({ asset: "ETH" as const, x })),
  ]
    .filter(({ x }) => {
      const t = x.observedAt.getTime();
      return t > start && t <= endAt;
    })
    .sort((a, b) => a.x.observedAt.getTime() - b.x.observedAt.getTime());
  const last = { BTC: baseB.value, ETH: baseE.value };
  let adverse = 0;
  let favorable = 0;
  for (const { asset, x } of events) {
    last[asset] = x.value;
    const value = portfolio(last.BTC, last.ETH);
    adverse = Math.min(adverse, value);
    favorable = Math.max(favorable, value);
  }
  return {
    observedAt: new Date(due),
    assetReturnsPercent: {
      BTC: (endB.value / baseB.value - 1) * 100,
      ETH: (endE.value / baseE.value - 1) * 100,
    },
    portfolioReturnPercent: portfolio(endB.value, endE.value),
    adverseExcursionPercent: adverse,
    favorableExcursionPercent: favorable,
    priceObservationIds: [baseB.id, baseE.id, endB.id, endE.id],
  };
}
