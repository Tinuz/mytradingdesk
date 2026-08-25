import { describe, expect, it } from "vitest";
import { portfolioRisk } from "./portfolio-risk";
describe("portfolio risk", () => {
  it("fails honestly on short history", () =>
    expect(
      portfolioRisk([], { BTC: 0.5, ETH: 0.4, CASH: 0.1 }).annualizedVolatility,
    ).toBeNull());
  it("computes drawdown and stress loss", () => {
    const r = portfolioRisk(
      [
        { date: "1", btc: 0.1, eth: 0.2 },
        { date: "2", btc: -0.2, eth: -0.3 },
        { date: "3", btc: 0.05, eth: 0.1 },
      ],
      { BTC: 0.5, ETH: 0.4, CASH: 0.1 },
    );
    expect(r.maximumDrawdown).toBeLessThan(0);
    expect(r.stressLossPercent).toBe(-51);
  });
  it("keeps cash outside crypto stress", () =>
    expect(
      portfolioRisk([], { BTC: 0, ETH: 0, CASH: 1 }).stressLossPercent,
    ).toBeCloseTo(0));
});
