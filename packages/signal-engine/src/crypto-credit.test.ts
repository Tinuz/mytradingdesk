import { describe, expect, it } from "vitest";
import {
  deriveGrowth,
  deriveRollingSum,
  deriveStablecoinMetrics,
  type CalculationPoint,
} from "./crypto-credit";

const daily = (days: number, start = 100): CalculationPoint[] =>
  Array.from({ length: days }, (_, index) => ({
    id: String(index),
    observedAt: new Date(Date.UTC(2026, 0, index + 1)),
    value: start + index,
  }));

describe("crypto-credit derived indicators", () => {
  it("separates current growth, 90-day growth and 30-day acceleration", () => {
    const metrics = deriveStablecoinMetrics(daily(100));
    const latest = metrics.slice(-3);
    expect(latest.map((item) => item.code)).toEqual([
      "STABLECOIN_GROWTH_30D_PERCENT",
      "STABLECOIN_GROWTH_90D_PERCENT",
      "STABLECOIN_GROWTH_ACCELERATION_PP",
    ]);
    expect(latest[0]!.inputObservationIds).toEqual(["99", "69"]);
    expect(latest[2]!.value).not.toBe(latest[0]!.value);
  });
  it("uses observations rather than calendar days for ETF session windows", () => {
    expect(deriveRollingSum(daily(20), "BTC_ETF_FLOW_20D_USD")).toHaveLength(1);
  });
  it("derives 30-day loan growth with auditable inputs", () => {
    expect(
      deriveGrowth(daily(31), "DEFI_LOANS_GROWTH_30D_PERCENT", 30)[0]
        ?.inputObservationIds,
    ).toEqual(["30", "0"]);
  });
});
