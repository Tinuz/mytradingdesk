import { describe, expect, it } from "vitest";
import { evaluateRegimes, SIGNAL_ENGINE_STATUS } from "./index";
import type {
  EngineIndicator,
  EngineObservation,
  ObservationSeries,
} from "./types";

const asOf = new Date("2026-08-22T12:00:00Z");
function series(
  indicator: EngineIndicator,
  days: number,
  start: number,
  dailyChange: number,
  endOffsetDays = 0,
): EngineObservation[] {
  return Array.from({ length: days }, (_, index) => ({
    indicator,
    observedAt: new Date(
      asOf.getTime() - (days - 1 - index + endOffsetDays) * 86_400_000,
    ),
    value: start + index * dailyChange,
    quality: "VALID" as const,
  }));
}
function flows(
  indicator: "BTC_ETF_NET_FLOW_USD" | "ETH_ETF_NET_FLOW_USD",
  value: number,
) {
  return series(indicator, 30, value, 0);
}
function environment(direction: -1 | 0 | 1): ObservationSeries {
  const sign = direction;
  return {
    DXY: series("DXY", 40, 100, -sign * 0.12),
    US10Y_REAL: series("US10Y_REAL", 40, 2, -sign * 0.02),
    US_NET_LIQUIDITY_USD: series("US_NET_LIQUIDITY_USD", 40, 5_000, sign * 12),
    STABLECOIN_SUPPLY_USD: series(
      "STABLECOIN_SUPPLY_USD",
      40,
      300_000_000_000,
      sign * 300_000_000,
    ),
    BTC_ETF_NET_FLOW_USD: flows("BTC_ETF_NET_FLOW_USD", sign * 200_000_000),
    ETH_ETF_NET_FLOW_USD: flows("ETH_ETF_NET_FLOW_USD", sign * 50_000_000),
    BTC_USD: series("BTC_USD", 240, 50_000, sign === 0 ? 0 : sign * 300),
    ETH_USD: series("ETH_USD", 240, 2_000, sign === 0 ? 0 : sign * 15),
  };
}

describe("Phase 3 deterministic regimes", () => {
  it("keeps regimes active alongside the Phase 4 decision engine", () =>
    expect(SIGNAL_ENGINE_STATUS).toBe("PHASE_4_DECISIONS_ACTIVE"));
  it("classifies a predefined constructive environment", () => {
    const output = evaluateRegimes({ asOf, observations: environment(1) });
    expect(output.macro.state).toMatch(/SUPPORTIVE/);
    expect(output.cryptoLiquidity.state).toMatch(/EXPANDING/);
    expect(output.assets.BTC.state).toMatch(/POSITIVE/);
    expect(output.assets.ETH.state).toMatch(/POSITIVE/);
  });
  it("classifies a predefined neutral environment", () => {
    const output = evaluateRegimes({ asOf, observations: environment(0) });
    expect(output.macro.state).toBe("NEUTRAL");
    expect(output.cryptoLiquidity.state).toBe("NEUTRAL");
    expect(output.assets.BTC.state).toBe("NEUTRAL");
  });
  it("classifies a predefined risk-off environment", () => {
    const output = evaluateRegimes({ asOf, observations: environment(-1) });
    expect(output.macro.state).toMatch(/RESTRICTIVE/);
    expect(output.cryptoLiquidity.state).toMatch(/CONTRACTING/);
    expect(output.assets.BTC.state).toMatch(/NEGATIVE/);
  });
  it("preserves disagreement between independent regimes", () => {
    const observations = environment(1);
    observations.STABLECOIN_SUPPLY_USD = series(
      "STABLECOIN_SUPPLY_USD",
      40,
      300_000_000_000,
      -500_000_000,
    );
    observations.BTC_ETF_NET_FLOW_USD = flows(
      "BTC_ETF_NET_FLOW_USD",
      -200_000_000,
    );
    observations.ETH_ETF_NET_FLOW_USD = flows(
      "ETH_ETF_NET_FLOW_USD",
      -50_000_000,
    );
    const output = evaluateRegimes({ asOf, observations });
    expect(output.macro.score).toBeGreaterThan(0);
    expect(output.cryptoLiquidity.score).toBeLessThan(0);
    expect(output.assets.BTC.score).not.toBeNull();
  });
  it("does not count missing DXY as neutral and blocks a strong macro result", () => {
    const observations = environment(1);
    delete observations.DXY;
    const output = evaluateRegimes({ asOf, observations });
    expect(output.macro.coverage).toBeCloseTo(2 / 3);
    expect(output.macro.score).toBe(1);
    expect(output.macro.warnings).toContain("DXY_30D:MISSING");
  });
  it("returns insufficient data when critical observations are stale", () => {
    const stale = environment(1);
    for (const values of Object.values(stale))
      for (const item of values ?? [])
        item.observedAt = new Date(item.observedAt.getTime() - 30 * 86_400_000);
    const output = evaluateRegimes({ asOf, observations: stale });
    expect(output.macro.status).toBe("INSUFFICIENT_DATA");
    expect(output.cryptoLiquidity.status).toBe("INSUFFICIENT_DATA");
    expect(output.assets.BTC.status).toBe("INSUFFICIENT_DATA");
  });
  it("is reproducible for identical inputs", () => {
    const input = { asOf, observations: environment(1) };
    expect(evaluateRegimes(input)).toEqual(evaluateRegimes(input));
  });
});
