import { describe, expect, it } from "vitest";
import {
  allocateShadowPortfolio,
  type AllocationAssetInput,
} from "./allocation";
const mandate = {
  minimumCashPercent: 10,
  maximumAssetWeightPercent: 70,
  allowedAssets: ["BTC", "ETH"] as const,
};
const asset = (
  name: "BTC" | "ETH",
  state: "NEUTRAL" | "ACCUMULATION" | "STRONG_ACCUMULATION" = "NEUTRAL",
): AllocationAssetInput => ({
  asset: name,
  opportunityState: state,
  stressState: "HEALTHY",
  expectedReturnPercent: 10,
  thesisActive: true,
  dataApproved: true,
  frozen: false,
});
describe("shadow allocation policy", () => {
  it("preserves cash and total weight", () => {
    const r = allocateShadowPortfolio(
      [
        asset("BTC", "STRONG_ACCUMULATION"),
        asset("ETH", "STRONG_ACCUMULATION"),
      ],
      mandate,
    );
    expect(r.cash.midpoint).toBeGreaterThanOrEqual(10);
    expect(
      r.targets.BTC.midpoint + r.targets.ETH.midpoint + r.cash.midpoint,
    ).toBe(100);
  });
  it("is monotonic", () =>
    expect(
      allocateShadowPortfolio([asset("BTC", "ACCUMULATION")], mandate).targets
        .BTC.midpoint,
    ).toBeGreaterThan(
      allocateShadowPortfolio([asset("BTC")], mandate).targets.BTC.midpoint,
    ));
  it("fails closed on unapproved data", () => {
    const x = asset("BTC");
    x.dataApproved = false;
    expect(allocateShadowPortfolio([x], mandate)).toMatchObject({
      status: "FROZEN",
      targets: { BTC: { midpoint: 0 } },
    });
  });
  it("requires an active thesis", () => {
    const x = asset("ETH");
    x.thesisActive = false;
    expect(allocateShadowPortfolio([x], mandate).targets.ETH.midpoint).toBe(0);
  });
  it("applies stress independently", () => {
    const x = asset("BTC", "STRONG_ACCUMULATION");
    x.stressState = "OVERHEATED";
    expect(
      allocateShadowPortfolio([x], mandate).targets.BTC.midpoint,
    ).toBeLessThanOrEqual(35);
  });
});
