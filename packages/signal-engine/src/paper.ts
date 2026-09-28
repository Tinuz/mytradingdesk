import type { AssetSymbol } from "@cmip/domain";

/**
 * Deterministic paper-portfolio mechanics. Everything here is a pure function
 * so the daily paper run can be replayed and tested without a database.
 */
export const PAPER_NAV_CALCULATION_VERSION = "paper-nav-v2" as const;
export const PAPER_ASSETS = [
  "BTC",
  "ETH",
] as const satisfies readonly AssetSymbol[];
const DAY_MS = 86_400_000;

export interface PaperCosts {
  feeRate: number;
  slippageRate: number;
  /** Deltas smaller than this share of NAV are not traded. */
  minimumTradeFraction: number;
}
export const DEFAULT_PAPER_COSTS: PaperCosts = {
  feeRate: 0.001,
  slippageRate: 0.0005,
  minimumTradeFraction: 0.01,
};

export interface TimedPrice {
  observedAt: Date;
  value: number;
}
export interface DailyClose {
  date: string;
  value: number;
}

/** Last observation per UTC day, in ascending date order. */
export function dailyCloses(points: readonly TimedPrice[]): DailyClose[] {
  const byDay = new Map<string, TimedPrice>();
  for (const point of points) {
    const date = point.observedAt.toISOString().slice(0, 10);
    const current = byDay.get(date);
    if (!current || point.observedAt >= current.observedAt)
      byDay.set(date, point);
  }
  return [...byDay]
    .map(([date, point]) => ({ date, value: point.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Simple average of the last `days` daily closes, or null without enough history. */
export function trailingDailyAverage(
  closes: readonly DailyClose[],
  days: number,
): number | null {
  if (days <= 0 || closes.length < days) return null;
  return closes.slice(-days).reduce((sum, x) => sum + x.value, 0) / days;
}

export interface TargetRange {
  minimum: number;
  maximum: number;
  midpoint: number;
}
export type TargetRanges = Record<string, TargetRange>;
export type ModifiedTargets = Record<
  string,
  { minimum: number; maximum: number; midpoint?: number }
>;

/**
 * Applies a human MODIFY decision to the model's target ranges. The cash
 * target is derived from the resulting asset midpoints so that a modified
 * allocation is not silently throttled by the model's original cash target.
 */
export function resolveExecutionTargets(
  original: TargetRanges,
  modified: ModifiedTargets | null,
): TargetRanges {
  const assets: TargetRanges = {};
  for (const asset of PAPER_ASSETS) {
    const base = original[asset];
    const change = modified?.[asset];
    if (change)
      assets[asset] = {
        minimum: Number(change.minimum),
        maximum: Number(change.maximum),
        midpoint:
          change.midpoint ??
          (Number(change.minimum) + Number(change.maximum)) / 2,
      };
    else if (base) assets[asset] = base;
  }
  if (!modified)
    return { ...assets, ...(original.CASH ? { CASH: original.CASH } : {}) };
  const risky = Object.values(assets).reduce((sum, x) => sum + x.midpoint, 0);
  const cash = Math.max(0, 100 - risky);
  return { ...assets, CASH: { minimum: cash, maximum: cash, midpoint: cash } };
}

export interface PaperBook {
  cash: number;
  positions: Record<(typeof PAPER_ASSETS)[number], number>;
}
export type PaperPrices = Record<(typeof PAPER_ASSETS)[number], number>;
export interface PlannedTrade {
  asset: (typeof PAPER_ASSETS)[number];
  side: "INCREASE" | "DECREASE";
  quantity: number;
  price: number;
  notional: number;
  fee: number;
  slippage: number;
}
export type SkipReason =
  | "ALREADY_EXECUTED"
  | "BELOW_MINIMUM_TRADE"
  | "INCREASE_BLOCKED"
  | "INSUFFICIENT_CASH";

export function bookNav(book: PaperBook, prices: PaperPrices): number {
  return PAPER_ASSETS.reduce(
    (sum, asset) => sum + book.positions[asset] * prices[asset],
    book.cash,
  );
}

/**
 * Moves the book towards the target midpoints. Sales are processed first so
 * they can fund purchases; purchases never spend below the target cash level.
 * `allowIncreases: false` enforces a freeze: risk may be reduced, not added.
 */
export function planPaperTrades(input: {
  book: PaperBook;
  prices: PaperPrices;
  targets: TargetRanges;
  alreadyExecuted: ReadonlySet<string>;
  allowIncreases: boolean;
  costs?: PaperCosts;
}): {
  book: PaperBook;
  trades: PlannedTrade[];
  skipped: Array<{ asset: string; reason: SkipReason }>;
} {
  const costs = input.costs ?? DEFAULT_PAPER_COSTS;
  const nav = bookNav(input.book, input.prices);
  const minimum = nav * costs.minimumTradeFraction;
  const costFactor = 1 + costs.feeRate + costs.slippageRate;
  const targetCash = (nav * (input.targets.CASH?.midpoint ?? 0)) / 100;
  let cash = input.book.cash;
  const positions = { ...input.book.positions };
  const trades: PlannedTrade[] = [];
  const skipped: Array<{ asset: string; reason: SkipReason }> = [];
  const planned = PAPER_ASSETS.flatMap((asset) => {
    if (input.alreadyExecuted.has(asset)) {
      skipped.push({ asset, reason: "ALREADY_EXECUTED" });
      return [];
    }
    const current = positions[asset] * input.prices[asset];
    const target = (nav * (input.targets[asset]?.midpoint ?? 0)) / 100;
    return [{ asset, delta: target - current }];
  })
    // Sales fund purchases; the secondary order keeps reruns reproducible.
    .sort((a, b) => a.delta - b.delta || a.asset.localeCompare(b.asset));
  for (const plan of planned) {
    const { asset } = plan;
    let { delta } = plan;
    if (Math.abs(delta) < minimum) {
      skipped.push({ asset, reason: "BELOW_MINIMUM_TRADE" });
      continue;
    }
    if (delta > 0) {
      if (!input.allowIncreases) {
        skipped.push({ asset, reason: "INCREASE_BLOCKED" });
        continue;
      }
      delta = Math.min(delta, Math.max(0, cash - targetCash) / costFactor);
      if (delta < minimum) {
        skipped.push({ asset, reason: "INSUFFICIENT_CASH" });
        continue;
      }
    }
    const notional = Math.abs(delta);
    const price = input.prices[asset];
    const quantity = notional / price;
    const fee = notional * costs.feeRate;
    const slippage = notional * costs.slippageRate;
    positions[asset] += Math.sign(delta) * quantity;
    cash -= delta + fee + slippage;
    trades.push({
      asset,
      side: delta > 0 ? "INCREASE" : "DECREASE",
      quantity,
      price,
      notional,
      fee,
      slippage,
    });
  }
  return { book: { cash, positions }, trades, skipped };
}

/**
 * State of the four frozen `benchmark-v1` baselines, kept as units so every
 * step can be replayed exactly. See migration 023 for the frozen definitions.
 */
export interface BenchmarkState {
  version: typeof BENCHMARK_STATE_VERSION;
  /** Prices and capital at portfolio start. */
  anchors: { BTC: number; ETH: number; capital: number };
  btcEth: { BTC: number; ETH: number };
  btcCash: { BTC: number; cash: number };
  dma: {
    BTC: number;
    cash: number;
    /** Target weight decided at the previous step; executed at this step. */
    riskOn: boolean;
  };
  valuedAt: string;
}
export interface BenchmarkNavs {
  BTC_HOLD: number;
  BTC_ETH_60_40: number;
  BTC_CASH_50_50: number;
  BTC_200DMA: number;
}
export const BENCHMARK_STATE_VERSION = "benchmark-state-v1" as const;
const BENCHMARK_FEE_RATE = 0.001; // feesBps: 10 in benchmark-v1
const monthOf = (iso: string) => iso.slice(0, 7);

function initialBenchmarkState(
  capital: number,
  prices: PaperPrices,
  valuedAt: string,
): BenchmarkState {
  return {
    version: BENCHMARK_STATE_VERSION,
    anchors: { BTC: prices.BTC, ETH: prices.ETH, capital },
    btcEth: {
      BTC: (capital * 0.6) / prices.BTC,
      ETH: (capital * 0.4) / prices.ETH,
    },
    btcCash: { BTC: (capital * 0.5) / prices.BTC, cash: capital * 0.5 },
    // No 200DMA signal exists before the first valuation: start in cash.
    dma: { BTC: 0, cash: capital, riskOn: false },
    valuedAt,
  };
}

/**
 * Restores benchmark state from a stored NAV row. Rows written by
 * paper-nav-v1 carry no explicit state; because v1 never rebalanced, the
 * units follow exactly from its anchors and last benchmark values.
 */
export function benchmarkStateFromNavRow(row: {
  calculated_at: string;
  benchmark_nav: unknown;
  attribution: unknown;
}): BenchmarkState | null {
  const attribution = (row.attribution ?? {}) as Record<string, unknown>;
  const stored = attribution.benchmarkState as BenchmarkState | undefined;
  if (stored?.version === BENCHMARK_STATE_VERSION) return stored;
  const anchors = attribution.anchors as BenchmarkState["anchors"] | undefined;
  if (!anchors?.BTC || !anchors.ETH || !anchors.capital) return null;
  const navs = (row.benchmark_nav ?? {}) as Record<string, number | null>;
  const lastBtc = Number(attribution.lastBtcPrice ?? anchors.BTC);
  const halfBtc = (anchors.capital * 0.5) / anchors.BTC;
  const dmaNav =
    navs.BTC_200DMA == null ? anchors.capital : Number(navs.BTC_200DMA);
  const riskOn = Boolean(attribution.btc200RiskOn);
  return {
    version: BENCHMARK_STATE_VERSION,
    anchors,
    btcEth: {
      BTC: (anchors.capital * 0.6) / anchors.BTC,
      ETH: (anchors.capital * 0.4) / anchors.ETH,
    },
    btcCash: {
      BTC: halfBtc,
      cash:
        navs.BTC_CASH_50_50 == null
          ? anchors.capital * 0.5
          : Number(navs.BTC_CASH_50_50) - halfBtc * lastBtc,
    },
    // v1 stored the signal for the next step; the v1 NAV was in the matching
    // asset from that step onwards, so the holding follows the prior signal.
    dma: riskOn
      ? { BTC: dmaNav / lastBtc, cash: 0, riskOn }
      : { BTC: 0, cash: dmaNav, riskOn },
    valuedAt: row.calculated_at,
  };
}

/**
 * Advances the four frozen benchmarks by one valuation step:
 *
 * - BTC_HOLD: buy-and-hold from the anchors, no costs.
 * - BTC_ETH_60_40 and BTC_CASH_50_50: rebalanced to their weights at the first
 *   valuation of each new UTC month, paying 10 bps on traded notional.
 * - BTC_200DMA: holds BTC when the previous step closed above the 200-day
 *   average and cash otherwise, switching at this step's price for 10 bps.
 *   Without an average the previous weight is held (HOLD_PREVIOUS_WEIGHT).
 * - Cash earns simple interest at the latest 3M T-bill yield for the elapsed
 *   calendar days; without a known rate it earns nothing that step.
 */
export function advanceBenchmarks(input: {
  previous: BenchmarkState | null;
  initialCapital: number;
  prices: PaperPrices;
  valuedAt: Date;
  annualCashRatePercent: number | null;
  btc200DayAverage: number | null;
  /** BTC price in the same currency as the 200-day average. */
  btcPriceForSignal: number;
}): { navs: BenchmarkNavs; state: BenchmarkState } {
  const { prices } = input;
  const valuedAt = input.valuedAt.toISOString();
  const previous =
    input.previous ??
    initialBenchmarkState(input.initialCapital, prices, valuedAt);
  const elapsedDays = Math.max(
    0,
    (input.valuedAt.getTime() - new Date(previous.valuedAt).getTime()) / DAY_MS,
  );
  const cashGrowth =
    1 + ((input.annualCashRatePercent ?? 0) / 100 / 365) * elapsedDays;
  const newMonth = monthOf(valuedAt) !== monthOf(previous.valuedAt);

  let btcEth = { ...previous.btcEth };
  if (newMonth) {
    const value = btcEth.BTC * prices.BTC + btcEth.ETH * prices.ETH;
    const traded = Math.abs(btcEth.BTC * prices.BTC - value * 0.6) * 2;
    const net = value - traded * BENCHMARK_FEE_RATE;
    btcEth = { BTC: (net * 0.6) / prices.BTC, ETH: (net * 0.4) / prices.ETH };
  }

  let btcCash = {
    ...previous.btcCash,
    cash: previous.btcCash.cash * cashGrowth,
  };
  if (newMonth) {
    const value = btcCash.BTC * prices.BTC + btcCash.cash;
    const traded = Math.abs(btcCash.BTC * prices.BTC - value * 0.5) * 2;
    const net = value - traded * BENCHMARK_FEE_RATE;
    btcCash = { BTC: (net * 0.5) / prices.BTC, cash: net * 0.5 };
  }

  let dma = { ...previous.dma, cash: previous.dma.cash * cashGrowth };
  if (dma.riskOn && dma.cash > 0)
    dma = {
      ...dma,
      BTC: dma.BTC + (dma.cash * (1 - BENCHMARK_FEE_RATE)) / prices.BTC,
      cash: 0,
    };
  else if (!dma.riskOn && dma.BTC > 0)
    dma = {
      ...dma,
      BTC: 0,
      cash: dma.cash + dma.BTC * prices.BTC * (1 - BENCHMARK_FEE_RATE),
    };
  dma.riskOn =
    input.btc200DayAverage === null
      ? previous.dma.riskOn
      : input.btcPriceForSignal > input.btc200DayAverage;

  const { anchors } = previous;
  return {
    navs: {
      BTC_HOLD: (anchors.capital * prices.BTC) / anchors.BTC,
      BTC_ETH_60_40: btcEth.BTC * prices.BTC + btcEth.ETH * prices.ETH,
      BTC_CASH_50_50: btcCash.BTC * prices.BTC + btcCash.cash,
      BTC_200DMA: dma.BTC * prices.BTC + dma.cash,
    },
    state: {
      version: BENCHMARK_STATE_VERSION,
      anchors,
      btcEth,
      btcCash,
      dma,
      valuedAt,
    },
  };
}
