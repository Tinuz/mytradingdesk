import { describe, expect, it } from "vitest";
import type {
  AssetRegime,
  CryptoCreditLiquidityRegime,
  MacroLiquidityRegime,
  MarketStructureRegime,
  RegimeScore,
} from "@cmip/domain";
import {
  configuredV3Decision,
  evaluateV3Decision,
  V3_DECISION_MATRIX,
} from "./v3-decisions";
import type { RegimeResult, V3DecisionInput, V3FactorResult } from "./types";
const liquidity: Record<RegimeScore, MacroLiquidityRegime> = {
  [-2]: "STRONGLY_CONTRACTING",
  [-1]: "CONTRACTING",
  0: "NEUTRAL",
  1: "EXPANDING",
  2: "STRONGLY_EXPANDING",
};
const market: Record<RegimeScore, MarketStructureRegime> = {
  [-2]: "CAPITULATION",
  [-1]: "STRESSED",
  0: "HEALTHY",
  1: "ELEVATED_RISK",
  2: "OVERHEATED",
};
const asset: Record<RegimeScore, AssetRegime> = {
  [-2]: "STRONGLY_NEGATIVE",
  [-1]: "NEGATIVE",
  0: "NEUTRAL",
  1: "POSITIVE",
  2: "STRONGLY_POSITIVE",
};
const result = <T extends string>(
  state: T,
  score: RegimeScore,
): RegimeResult<T, V3FactorResult> => ({
  state,
  score,
  status: "AVAILABLE",
  coverage: 1,
  warnings: [],
  factors: [
    {
      code: "FIXTURE",
      family: "ASSET_TREND",
      classification: "CONFIRMING",
      classificationStatus: "HYPOTHESIS",
      score,
      rawValue: score,
      description: "fixture",
      status: "VALID",
    },
  ],
});
const input = (
  m: RegimeScore,
  c: RegimeScore,
  ms: RegimeScore,
  a: RegimeScore,
): V3DecisionInput => ({
  macroLiquidity: result(liquidity[m], m),
  cryptoCreditLiquidity: result(liquidity[c] as CryptoCreditLiquidityRegime, c),
  marketStructure: result(market[ms], ms),
  asset: result(asset[a], a),
});
const cases: [
  string,
  RegimeScore,
  RegimeScore,
  RegimeScore,
  RegimeScore,
  string,
  string,
][] = [];
for (const [family, m, c, a, expected] of [
  ["strong", 2, 2, 1, "STRONG_ACCUMULATION"],
  ["accumulation", 1, 1, 0, "ACCUMULATION"],
  ["neutral", 0, 0, 0, "NEUTRAL"],
  ["risk reduction", -1, -1, 0, "RISK_REDUCTION"],
  ["defensive", -2, -1, -1, "DEFENSIVE"],
  ["conflict", 2, -2, 2, "NEUTRAL"],
] as const)
  for (const ms of [-2, -1, 0, 1, 2] as const) {
    const capped =
      family === "strong" && ms !== 0
        ? ms < 0
          ? "NEUTRAL"
          : "ACCUMULATION"
        : family === "accumulation" && ms < 0
          ? "NEUTRAL"
          : expected;
    cases.push([
      `${family} / market ${ms}`,
      m,
      c,
      ms,
      a,
      capped,
      (ms === 2 || ms === 1) && family === "strong"
        ? "OVERHEAT_CAP"
        : ms === -1 && (family === "strong" || family === "accumulation")
          ? "STRESS_CAP"
          : ms === -2 && (family === "strong" || family === "accumulation")
            ? "CAPITULATION_CAP"
            : "NONE",
    ]);
  }
describe("v3 decision matrix", () => {
  it("contains all 625 four-layer combinations", () =>
    expect(Object.keys(V3_DECISION_MATRIX)).toHaveLength(625));
  it.each(cases)("scenario %s", (_name, m, c, ms, a, state, override) => {
    expect(configuredV3Decision(m, c, ms, a)).toEqual({
      state,
      riskOverride: override,
    });
  });
  it("exposes opportunity and stress independently", () => {
    const result = evaluateV3Decision(input(2, 1, -2, 1));
    expect(result).toMatchObject({
      opportunityState: "ACCUMULATION",
      opportunityScore: 4,
      stressState: "CAPITULATION",
      stressScore: -2,
      state: "NEUTRAL",
      riskOverride: "CAPITULATION_CAP",
    });
  });
  it("requires two persistent observations after hysteresis permits a transition", () => {
    const first = evaluateV3Decision({
      ...input(1, 1, 0, 1),
      memory: {
        currentState: "NEUTRAL",
        pendingState: null,
        consecutiveObservations: 0,
      },
    });
    expect(first.transitionReason).toBe("PENDING_CONFIRMATION");
    const second = evaluateV3Decision({
      ...input(1, 1, 0, 1),
      memory: first.memory,
    });
    expect(second).toMatchObject({
      state: "ACCUMULATION",
      transitioned: true,
      transitionReason: "PERSISTENCE_CONFIRMED",
    });
  });
  it("fails closed when a regime is unavailable", () => {
    const value = input(1, 1, 0, 1);
    value.marketStructure = {
      ...value.marketStructure,
      state: null,
      score: null,
      status: "INSUFFICIENT_DATA",
    };
    expect(evaluateV3Decision(value)).toMatchObject({
      status: "INSUFFICIENT_DATA",
      state: null,
      opportunityState: "ACCUMULATION",
      stressState: null,
    });
  });
  it("applies market stress immediately to a state held by hysteresis", () => {
    // Opportunity total 6 stays above the strong-accumulation exit (3), so
    // hysteresis alone would keep STRONG_ACCUMULATION despite capitulation.
    const held = evaluateV3Decision({
      ...input(2, 2, -2, 2),
      memory: {
        currentState: "STRONG_ACCUMULATION",
        pendingState: null,
        consecutiveObservations: 0,
      },
    });
    expect(held).toMatchObject({
      state: "NEUTRAL",
      previousState: "STRONG_ACCUMULATION",
      transitioned: true,
      transitionReason: "STRESS_CAP_APPLIED",
      riskOverride: "CAPITULATION_CAP",
      memory: { currentState: "NEUTRAL", pendingState: null },
    });
    const overheated = evaluateV3Decision({
      ...input(2, 2, 2, 2),
      memory: {
        currentState: "STRONG_ACCUMULATION",
        pendingState: null,
        consecutiveObservations: 0,
      },
    });
    expect(overheated).toMatchObject({
      state: "ACCUMULATION",
      transitionReason: "STRESS_CAP_APPLIED",
      riskOverride: "OVERHEAT_CAP",
    });
  });
  it("never lets a stress cap raise a state that is already below it", () => {
    const result = evaluateV3Decision({
      ...input(-1, -1, -1, 0),
      memory: {
        currentState: "RISK_REDUCTION",
        pendingState: null,
        consecutiveObservations: 0,
      },
    });
    expect(result.state).toBe("RISK_REDUCTION");
    expect(result.transitionReason).not.toBe("STRESS_CAP_APPLIED");
  });
  it("holds every positive state at or below the stress ceiling", () => {
    const ceiling: Record<number, number> = {
      [-2]: 0,
      [-1]: 0,
      0: 2,
      1: 1,
      2: 1,
    };
    const rank = {
      DEFENSIVE: -2,
      RISK_REDUCTION: -1,
      NEUTRAL: 0,
      ACCUMULATION: 1,
      STRONG_ACCUMULATION: 2,
    } as const;
    const scores = [-2, -1, 0, 1, 2] as const;
    for (const current of Object.keys(rank) as (keyof typeof rank)[])
      for (const m of scores)
        for (const c of scores)
          for (const ms of scores)
            for (const a of scores) {
              const result = evaluateV3Decision({
                ...input(m, c, ms, a),
                memory: {
                  currentState: current,
                  pendingState: null,
                  consecutiveObservations: 0,
                },
              });
              expect(rank[result.state!]).toBeLessThanOrEqual(ceiling[ms]!);
            }
  });
});
