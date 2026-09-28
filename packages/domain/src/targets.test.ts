import { describe, expect, it } from "vitest";
import {
  modifiedTargetViolations,
  sameTargetMidpoints,
  resolveExecutionTargets,
  type TargetRanges,
} from "./targets";

const range = (minimum: number, maximum: number, midpoint: number) => ({
  minimum,
  maximum,
  midpoint,
});
// Allocator output with a 45% asset cap: BTC's midpoint sits at the cap while
// its range middle is 42.5.
const capped: TargetRanges = {
  BTC: range(40, 45, 45),
  ETH: range(5, 15, 10),
  CASH: range(40, 50, 45),
};
const mandate = {
  minimumCashPercent: 20,
  maximumAssetWeightPercent: 45,
  allowedAssets: ["BTC", "ETH"],
};

describe("execution targets", () => {
  it("returns the model targets unchanged without a modification", () => {
    expect(resolveExecutionTargets(capped, null, 20)).toEqual(capped);
  });

  it("executes modified assets at the middle of their new range and derives cash", () => {
    const resolved = resolveExecutionTargets(
      capped,
      { ETH: { minimum: 20, maximum: 30 } },
      20,
    );
    expect(resolved.BTC!.midpoint).toBe(45);
    expect(resolved.ETH!.midpoint).toBe(25);
    expect(resolved.CASH!.midpoint).toBe(30);
  });

  it("ignores a supplied midpoint and never targets less than the minimum cash", () => {
    const resolved = resolveExecutionTargets(
      capped,
      {
        ETH: { minimum: 35, maximum: 40, midpoint: 40 } as {
          minimum: number;
          maximum: number;
        },
      },
      20,
    );
    expect(resolved.CASH!.midpoint).toBe(20);
    expect(resolved.BTC!.midpoint + resolved.ETH!.midpoint).toBeCloseTo(80);
    expect(resolved.BTC!.midpoint / resolved.ETH!.midpoint).toBeCloseTo(
      45 / 37.5,
    );
    // Scaling must not leak into the model's stored targets.
    expect(capped.BTC!.midpoint).toBe(45);
  });
});

describe("modified target validation", () => {
  it("judges the cash floor with the midpoints execution uses", () => {
    // (min+max)/2 for every asset would give 42.5 + 37.5 = 80 and pass; the
    // executed midpoints are 45 + 37.5 = 82.5, which breaches the 20% floor.
    expect(
      modifiedTargetViolations(
        capped,
        { ETH: { minimum: 35, maximum: 40 } },
        mandate,
      ),
    ).toEqual(["CASH_FLOOR"]);
    expect(
      modifiedTargetViolations(
        capped,
        { ETH: { minimum: 30, maximum: 40 } },
        mandate,
      ),
    ).toEqual([]);
  });

  it("rejects unknown assets, invalid ranges and ranges above the asset cap", () => {
    expect(
      modifiedTargetViolations(
        capped,
        {
          SOL: { minimum: 1, maximum: 2 },
          BTC: { minimum: 10, maximum: 5 },
          ETH: { minimum: 10, maximum: 50 },
        },
        mandate,
      ),
    ).toEqual(["SOL:NOT_ALLOWED", "BTC:INVALID_RANGE", "ETH:ABOVE_ASSET_CAP"]);
    expect(modifiedTargetViolations(capped, {}, mandate)).toEqual([
      "NO_CHANGES",
    ]);
  });
});

describe("unchanged recommendations", () => {
  it("compares midpoints of every asset and cash", () => {
    expect(sameTargetMidpoints(capped, structuredClone(capped))).toBe(true);
    expect(
      sameTargetMidpoints(capped, { ...capped, ETH: range(5, 15, 10.5) }),
    ).toBe(false);
    expect(sameTargetMidpoints(capped, { BTC: capped.BTC })).toBe(false);
  });
});
