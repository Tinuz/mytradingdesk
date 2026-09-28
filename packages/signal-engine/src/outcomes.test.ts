import { describe, expect, it } from "vitest";
import { recommendationOutcome, type ObservedPrice } from "./outcomes";

const series = (
  prefix: string,
  points: ReadonlyArray<[string, number]>,
): ObservedPrice[] =>
  points.map(([iso, value], i) => ({
    id: `${prefix}-${i}`,
    observedAt: new Date(iso),
    value,
  }));
const calculatedAt = new Date("2026-03-01T05:00:00Z");
const weightsPercent = { BTC: 50, ETH: 20 };

describe("recommendation outcomes", () => {
  it("measures return and excursions only within the holding period", () => {
    const btc = series("b", [
      ["2026-02-28T05:00:00Z", 10], // before entry: must not affect the path
      ["2026-03-01T04:00:00Z", 100], // entry
      ["2026-03-04T00:00:00Z", 80],
      ["2026-03-06T00:00:00Z", 130],
      ["2026-03-08T06:00:00Z", 110], // exit (first at or after +7d)
      ["2026-03-09T00:00:00Z", 500], // after exit: must not affect the path
    ]);
    const eth = series("e", [
      ["2026-03-01T00:00:00Z", 10],
      ["2026-03-08T05:30:00Z", 12],
    ]);
    const outcome = recommendationOutcome({
      calculatedAt,
      horizonDays: 7,
      weightsPercent,
      btc,
      eth,
    })!;
    expect(outcome.assetReturnsPercent.BTC).toBeCloseTo(10);
    expect(outcome.assetReturnsPercent.ETH).toBeCloseTo(20);
    expect(outcome.portfolioReturnPercent).toBeCloseTo(0.5 * 10 + 0.2 * 20);
    // BTC -20% with ETH unchanged, then BTC +30%.
    expect(outcome.adverseExcursionPercent).toBeCloseTo(-10);
    expect(outcome.favorableExcursionPercent).toBeCloseTo(0.5 * 30 + 0.2 * 20);
    expect(outcome.priceObservationIds).toEqual(["b-1", "e-0", "b-4", "e-1"]);
    expect(outcome.observedAt.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("reports no adverse excursion for a path that only rises", () => {
    const outcome = recommendationOutcome({
      calculatedAt,
      horizonDays: 1,
      weightsPercent,
      btc: series("b", [
        ["2026-03-01T00:00:00Z", 100],
        ["2026-03-02T05:00:00Z", 105],
      ]),
      eth: series("e", [
        ["2026-03-01T00:00:00Z", 10],
        ["2026-03-02T05:00:00Z", 10],
      ]),
    })!;
    expect(outcome.adverseExcursionPercent).toBe(0);
    expect(outcome.favorableExcursionPercent).toBeCloseTo(2.5);
  });

  it("returns null without an entry price or an exit within two days of the horizon", () => {
    const eth = series("e", [
      ["2026-03-01T00:00:00Z", 10],
      ["2026-03-02T05:00:00Z", 10],
    ]);
    expect(
      recommendationOutcome({
        calculatedAt,
        horizonDays: 1,
        weightsPercent,
        btc: series("b", [["2026-03-02T05:00:00Z", 100]]),
        eth,
      }),
    ).toBeNull();
    expect(
      recommendationOutcome({
        calculatedAt,
        horizonDays: 1,
        weightsPercent,
        btc: series("b", [
          ["2026-03-01T00:00:00Z", 100],
          ["2026-03-05T00:00:00Z", 100],
        ]),
        eth,
      }),
    ).toBeNull();
  });
});
