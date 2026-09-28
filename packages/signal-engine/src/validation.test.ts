import { describe, expect, it } from "vitest";
import { outcomeAt, summarizeValidation } from "./validation";
describe("validation analytics", () => {
  it("calculates forward return and adverse excursion without future overflow", () => {
    const prices = [100, 90, 110].map((value, index) => ({
      date: String(index),
      value,
    }));
    expect(outcomeAt(prices, 0, 2)).toEqual({
      forwardReturn: 10.000000000000009,
      adverseExcursion: -9.999999999999998,
    });
    expect(outcomeAt(prices, 1, 2)).toEqual({
      forwardReturn: null,
      adverseExcursion: null,
    });
  });
  it("reports samples rather than manufacturing incomplete horizons", () => {
    const summary = summarizeValidation([
      {
        date: "2026-01-01",
        asset: "BTC",
        decision: "NEUTRAL",
        transitioned: false,
        price: 100,
        forwardReturns: { 30: 5, 90: null },
        adverseExcursions: { 30: -2, 90: null },
      },
    ]);
    expect(summary.byAsset.BTC[30]).toMatchObject({
      samples: 1,
      meanForwardReturn: 5,
    });
    expect(summary.byAsset.BTC[90].samples).toBe(0);
  });
  it("separates non-overlapping samples", () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    const points = Array.from({ length: 40 }, (_, i) => ({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      asset: "BTC" as const,
      decision: "NEUTRAL" as const,
      transitioned: false,
      price: 100,
      forwardReturns: { 30: 1 },
      adverseExcursions: { 30: -1 },
    }));
    expect(
      summarizeValidation(points).nonOverlappingByDecision["BTC:NEUTRAL"]?.[30]
        ?.samples,
    ).toBe(2);
  });
});
