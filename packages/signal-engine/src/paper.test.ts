import { describe, expect, it } from "vitest";
import {
  advanceBenchmarks,
  benchmarkStateFromNavRow,
  bookNav,
  dailyCloses,
  planPaperTrades,
  resolveExecutionTargets,
  trailingDailyAverage,
  type TargetRanges,
} from "./paper";

const at = (iso: string) => new Date(iso);
const range = (midpoint: number) => ({
  minimum: Math.max(0, midpoint - 5),
  maximum: midpoint + 5,
  midpoint,
});
const targets = (btc: number, eth: number): TargetRanges => ({
  BTC: range(btc),
  ETH: range(eth),
  CASH: range(100 - btc - eth),
});
const prices = { BTC: 50_000, ETH: 2_500 };
const none = new Set<string>();

describe("daily closes", () => {
  it("keeps the last observation per UTC day regardless of input order", () => {
    const closes = dailyCloses([
      { observedAt: at("2026-01-02T23:00:00Z"), value: 12 },
      { observedAt: at("2026-01-01T01:00:00Z"), value: 1 },
      { observedAt: at("2026-01-01T23:55:00Z"), value: 2 },
      { observedAt: at("2026-01-02T00:05:00Z"), value: 11 },
    ]);
    expect(closes).toEqual([
      { date: "2026-01-01", value: 2 },
      { date: "2026-01-02", value: 12 },
    ]);
  });

  it("averages days, not observations, so intraday density cannot shorten the window", () => {
    // Three observations per day for 250 days: a 200-observation average
    // would cover ~67 days, the 200-day average must cover 200 days.
    const points = Array.from({ length: 250 }, (_, day) =>
      [0, 8, 16].map((hour) => ({
        observedAt: new Date(Date.UTC(2025, 0, 1 + day, hour)),
        value: day + 1,
      })),
    ).flat();
    const closes = dailyCloses(points);
    expect(closes).toHaveLength(250);
    // Mean of 51..250.
    expect(trailingDailyAverage(closes, 200)).toBe(150.5);
    expect(trailingDailyAverage(closes.slice(0, 199), 200)).toBeNull();
  });
});

describe("execution targets", () => {
  it("returns the model targets unchanged without a modification", () => {
    const original = targets(30, 20);
    expect(resolveExecutionTargets(original, null)).toEqual(original);
  });

  it("derives the cash target from a human modification", () => {
    const resolved = resolveExecutionTargets(targets(20, 10), {
      BTC: { minimum: 35, maximum: 45 },
    });
    expect(resolved.BTC!.midpoint).toBe(40);
    expect(resolved.ETH!.midpoint).toBe(10);
    expect(resolved.CASH!.midpoint).toBe(50);
  });
});

describe("paper trade planning", () => {
  const fresh = { cash: 100_000, positions: { BTC: 0, ETH: 0 } };

  it("buys towards midpoints and charges fees and slippage", () => {
    const result = planPaperTrades({
      book: fresh,
      prices,
      targets: targets(30, 20),
      alreadyExecuted: none,
      allowIncreases: true,
    });
    expect(result.trades.map((t) => [t.asset, t.side])).toEqual([
      ["ETH", "INCREASE"],
      ["BTC", "INCREASE"],
    ]);
    const [eth, btc] = result.trades;
    expect(eth!.notional).toBe(20_000);
    expect(eth!.fee + eth!.slippage).toBeCloseTo(30);
    // Costs come out of the last purchase so cash never drops below target.
    expect(btc!.notional).toBeCloseTo((80_000 - 30 - 50_000) / 1.0015);
    expect(result.book.cash).toBeCloseTo(50_000);
  });

  it("applies a human modification in full instead of throttling it by the old cash target", () => {
    const resolved = resolveExecutionTargets(targets(20, 10), {
      BTC: { minimum: 35, maximum: 45 },
    });
    const result = planPaperTrades({
      book: fresh,
      prices,
      targets: resolved,
      alreadyExecuted: none,
      allowIncreases: true,
    });
    const btc = result.trades.find((t) => t.asset === "BTC")!;
    // With the model's original 70% cash target this purchase would have been
    // capped near 20k; the derived 50% cash target allows the full ~40k.
    expect(btc.notional).toBeGreaterThan(39_900);
  });

  it("sells before buying and never spends below the cash target", () => {
    const book = { cash: 0, positions: { BTC: 1, ETH: 20 } }; // 50k + 50k
    const result = planPaperTrades({
      book,
      prices,
      targets: targets(20, 70),
      alreadyExecuted: none,
      allowIncreases: true,
    });
    expect(result.trades[0]).toMatchObject({ asset: "BTC", side: "DECREASE" });
    expect(result.book.cash).toBeGreaterThanOrEqual(10_000 - 1e-6);
    expect(bookNav(result.book, prices)).toBeLessThan(100_000);
  });

  it("blocks increases during a freeze but still reduces risk", () => {
    const book = { cash: 50_000, positions: { BTC: 1, ETH: 0 } };
    const result = planPaperTrades({
      book,
      prices,
      targets: targets(20, 30),
      alreadyExecuted: none,
      allowIncreases: false,
    });
    expect(result.trades.map((t) => [t.asset, t.side])).toEqual([
      ["BTC", "DECREASE"],
    ]);
    expect(result.skipped).toContainEqual({
      asset: "ETH",
      reason: "INCREASE_BLOCKED",
    });
  });

  it("is idempotent per asset and ignores deltas below the minimum trade size", () => {
    const result = planPaperTrades({
      book: { cash: 70_000, positions: { BTC: 0.6, ETH: 0 } },
      prices,
      targets: targets(30.5, 20),
      alreadyExecuted: new Set(["ETH"]),
      allowIncreases: true,
    });
    expect(result.trades).toEqual([]);
    expect(result.skipped).toEqual([
      { asset: "ETH", reason: "ALREADY_EXECUTED" },
      { asset: "BTC", reason: "BELOW_MINIMUM_TRADE" },
    ]);
  });
});

describe("benchmarks", () => {
  const base = {
    initialCapital: 100_000,
    annualCashRatePercent: 3.65,
    btc200DayAverage: null,
    btcPriceForSignal: 50_000,
  };

  it("starts every benchmark at the initial capital", () => {
    const { navs } = advanceBenchmarks({
      ...base,
      previous: null,
      prices,
      valuedAt: at("2026-01-01T05:00:00Z"),
    });
    expect(navs).toEqual({
      BTC_HOLD: 100_000,
      BTC_ETH_60_40: 100_000,
      BTC_CASH_50_50: 100_000,
      BTC_200DMA: 100_000,
    });
  });

  it("executes the 200DMA signal one step later and holds the previous weight without an average", () => {
    const daily = (0.0365 / 365) * 2;
    const first = advanceBenchmarks({
      ...base,
      previous: null,
      prices,
      valuedAt: at("2026-01-01T05:00:00Z"),
      btc200DayAverage: 40_000,
    });
    // Signal is on, but the benchmark only moves into BTC at the next step.
    expect(first.navs.BTC_200DMA).toBe(100_000);
    expect(first.state.dma).toEqual({ BTC: 0, cash: 100_000, riskOn: true });

    const second = advanceBenchmarks({
      ...base,
      previous: first.state,
      prices: { BTC: 55_000, ETH: 2_500 },
      valuedAt: at("2026-01-03T05:00:00Z"),
      btcPriceForSignal: 55_000,
    });
    const invested = 100_000 * (1 + daily) * 0.999;
    expect(second.navs.BTC_200DMA).toBeCloseTo(invested);
    // No average today: keep the previous weight instead of resetting.
    expect(second.state.dma.riskOn).toBe(true);

    const third = advanceBenchmarks({
      ...base,
      previous: second.state,
      prices: { BTC: 44_000, ETH: 2_500 },
      valuedAt: at("2026-01-04T05:00:00Z"),
      btc200DayAverage: 50_000,
      btcPriceForSignal: 44_000,
    });
    expect(third.navs.BTC_200DMA).toBeCloseTo((invested * 44) / 55);
    expect(third.state.dma.riskOn).toBe(false);

    const fourth = advanceBenchmarks({
      ...base,
      previous: third.state,
      prices: { BTC: 40_000, ETH: 2_500 },
      valuedAt: at("2026-01-05T05:00:00Z"),
      btcPriceForSignal: 40_000,
    });
    expect(fourth.navs.BTC_200DMA).toBeCloseTo(((invested * 40) / 55) * 0.999);
    expect(fourth.state.dma.riskOn).toBe(false);
  });

  it("drifts within a month and rebalances with costs at the first valuation of a new month", () => {
    const start = advanceBenchmarks({
      ...base,
      annualCashRatePercent: null,
      previous: null,
      prices,
      valuedAt: at("2026-01-30T05:00:00Z"),
    });
    const sameMonth = advanceBenchmarks({
      ...base,
      annualCashRatePercent: null,
      previous: start.state,
      prices: { BTC: 100_000, ETH: 2_500 },
      valuedAt: at("2026-01-31T05:00:00Z"),
    });
    // 1.2 BTC at 100k + 16 ETH at 2.5k, no trading yet.
    expect(sameMonth.navs.BTC_ETH_60_40).toBe(160_000);
    expect(sameMonth.state.btcEth).toEqual(start.state.btcEth);

    const nextMonth = advanceBenchmarks({
      ...base,
      annualCashRatePercent: null,
      previous: sameMonth.state,
      prices: { BTC: 100_000, ETH: 2_500 },
      valuedAt: at("2026-02-01T05:00:00Z"),
    });
    // Moving 24k from BTC to ETH trades 48k notional at 10 bps.
    expect(nextMonth.navs.BTC_ETH_60_40).toBeCloseTo(160_000 - 48);
    expect(nextMonth.state.btcEth.BTC * 100_000).toBeCloseTo(
      (160_000 - 48) * 0.6,
    );
    // 50/50: 0.5 BTC at 100k + 50k cash, rebalanced by moving 25k.
    expect(nextMonth.navs.BTC_CASH_50_50).toBeCloseTo(150_000 - 50);
    expect(nextMonth.navs.BTC_HOLD).toBe(200_000);
  });

  it("compounds the cash leg per elapsed calendar day", () => {
    const start = advanceBenchmarks({
      ...base,
      previous: null,
      prices,
      valuedAt: at("2026-01-01T05:00:00Z"),
    });
    const later = advanceBenchmarks({
      ...base,
      previous: start.state,
      prices,
      valuedAt: at("2026-01-11T05:00:00Z"),
    });
    expect(later.state.btcCash.cash).toBeCloseTo(50_000 * (1 + 0.0365 / 36.5));
  });

  it("reconstructs state from paper-nav-v1 rows", () => {
    const state = benchmarkStateFromNavRow({
      calculated_at: "2026-01-02T05:00:00Z",
      benchmark_nav: { BTC_CASH_50_50: 105_010, BTC_200DMA: 99_000 },
      attribution: {
        anchors: { BTC: 50_000, ETH: 2_500, capital: 100_000 },
        lastBtcPrice: 55_000,
        btc200RiskOn: true,
      },
    });
    expect(state).toEqual({
      version: "benchmark-state-v1",
      anchors: { BTC: 50_000, ETH: 2_500, capital: 100_000 },
      btcEth: { BTC: 1.2, ETH: 16 },
      btcCash: { BTC: 1, cash: 50_010 },
      dma: { BTC: 1.8, cash: 0, riskOn: true },
      valuedAt: "2026-01-02T05:00:00Z",
    });
    expect(
      benchmarkStateFromNavRow({
        calculated_at: "2026-01-02T05:00:00Z",
        benchmark_nav: {},
        attribution: {},
      }),
    ).toBeNull();
  });

  it("round-trips its own stored state", () => {
    const { state } = advanceBenchmarks({
      ...base,
      previous: null,
      prices,
      valuedAt: at("2026-01-01T05:00:00Z"),
    });
    expect(
      benchmarkStateFromNavRow({
        calculated_at: state.valuedAt,
        benchmark_nav: {},
        attribution: { benchmarkState: state },
      }),
    ).toEqual(state);
  });
});
