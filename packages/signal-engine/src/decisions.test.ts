import { describe, expect, it } from "vitest";
import type {
  AssetRegime,
  CryptoLiquidityRegime,
  InvestmentRegime,
  MacroRegime,
  RegimeScore,
} from "@cmip/domain";
import { DECISION_MATRIX, PHASE_FOUR_CONFIG, evaluateDecision } from "./index";
import type { DecisionInput, FactorResult, RegimeResult } from "./types";

const macroStates: Record<RegimeScore, MacroRegime> = {
  [-2]: "STRONGLY_RESTRICTIVE",
  [-1]: "RESTRICTIVE",
  0: "NEUTRAL",
  1: "SUPPORTIVE",
  2: "STRONGLY_SUPPORTIVE",
};
const cryptoStates: Record<RegimeScore, CryptoLiquidityRegime> = {
  [-2]: "STRONGLY_CONTRACTING",
  [-1]: "CONTRACTING",
  0: "NEUTRAL",
  1: "EXPANDING",
  2: "STRONGLY_EXPANDING",
};
const assetStates: Record<RegimeScore, AssetRegime> = {
  [-2]: "STRONGLY_NEGATIVE",
  [-1]: "NEGATIVE",
  0: "NEUTRAL",
  1: "POSITIVE",
  2: "STRONGLY_POSITIVE",
};
function regime<T extends string>(
  state: T,
  score: RegimeScore,
  options: {
    coverage?: number;
    warnings?: string[];
    factorScore?: RegimeScore;
  } = {},
): RegimeResult<T> {
  const factorScore = options.factorScore ?? score;
  const factor: FactorResult = {
    code: `FACTOR_${factorScore}`,
    family: "LIQUIDITY",
    timing: "LEADING",
    score: factorScore,
    rawValue: factorScore,
    description: "Deterministic fixture",
    status: "VALID",
  };
  return {
    state,
    score,
    status: "AVAILABLE",
    coverage: options.coverage ?? 1,
    factors: [factor],
    warnings: options.warnings ?? [],
  };
}
function input(
  macro: RegimeScore,
  crypto: RegimeScore,
  asset: RegimeScore,
): DecisionInput {
  return {
    macro: regime(macroStates[macro], macro),
    cryptoLiquidity: regime(cryptoStates[crypto], crypto),
    asset: regime(assetStates[asset], asset),
  };
}

const scenarios: [RegimeScore, RegimeScore, RegimeScore, InvestmentRegime][] = [
  [2, 2, 2, "STRONG_ACCUMULATION"],
  [2, 2, 1, "STRONG_ACCUMULATION"],
  [2, 1, 1, "ACCUMULATION"],
  [1, 1, 0, "ACCUMULATION"],
  [0, 1, 1, "ACCUMULATION"],
  [1, 0, 1, "ACCUMULATION"],
  [1, -1, 1, "NEUTRAL"],
  [-1, 1, 1, "NEUTRAL"],
  [0, 0, 1, "NEUTRAL"],
  [0, 0, 0, "NEUTRAL"],
  [2, -2, 2, "NEUTRAL"],
  [-2, 2, 2, "NEUTRAL"],
  [-1, -1, -1, "RISK_REDUCTION"],
  [0, -1, -1, "RISK_REDUCTION"],
  [-1, 0, -1, "RISK_REDUCTION"],
  [-2, -1, -1, "DEFENSIVE"],
  [-2, -2, -2, "DEFENSIVE"],
  [-2, -2, -1, "DEFENSIVE"],
  [1, -2, -2, "NEUTRAL"],
  [-1, -2, 1, "RISK_REDUCTION"],
];

describe("Phase 4 decision scenarios", () => {
  it.each(scenarios)(
    "maps macro %i crypto %i asset %i to %s",
    (macro, crypto, asset, expected) =>
      expect(evaluateDecision(input(macro, crypto, asset)).state).toBe(
        expected,
      ),
  );
  it("contains all 125 matrix combinations", () =>
    expect(Object.keys(DECISION_MATRIX)).toHaveLength(125));
  it("requires two consecutive observations before a transition", () => {
    const first = evaluateDecision({
      ...input(1, 1, 1),
      memory: {
        currentState: "NEUTRAL",
        pendingState: null,
        consecutiveObservations: 0,
      },
    });
    expect(first.state).toBe("NEUTRAL");
    expect(first.transitionReason).toBe("PENDING_CONFIRMATION");
    const second = evaluateDecision({
      ...input(1, 1, 1),
      memory: first.memory,
    });
    expect(second.state).toBe("ACCUMULATION");
    expect(second.transitionReason).toBe("PERSISTENCE_CONFIRMED");
  });
  it("resets persistence when the candidate changes", () => {
    const output = evaluateDecision({
      ...input(-1, -1, -1),
      memory: {
        currentState: "NEUTRAL",
        pendingState: "ACCUMULATION",
        consecutiveObservations: 1,
      },
    });
    expect(output.memory).toMatchObject({
      pendingState: "RISK_REDUCTION",
      consecutiveObservations: 1,
    });
  });
  it("uses hysteresis to retain accumulation at a weak neutral boundary", () => {
    const output = evaluateDecision({
      ...input(1, -1, 1),
      memory: {
        currentState: "ACCUMULATION",
        pendingState: null,
        consecutiveObservations: 0,
      },
    });
    expect(output.state).toBe("ACCUMULATION");
    expect(output.transitionReason).toBe("HYSTERESIS_HELD");
  });
  it("applies a documented shock immediately", () => {
    const output = evaluateDecision({
      ...input(2, 2, 2),
      memory: {
        currentState: "ACCUMULATION",
        pendingState: null,
        consecutiveObservations: 0,
      },
      shock: "SYSTEMIC_STABLECOIN_FAILURE",
    });
    expect(output.state).toBe("DEFENSIVE");
    expect(output.transitionReason).toBe("SHOCK_OVERRIDE");
  });
  it("does not manufacture a decision from stale critical data", () => {
    const stale = input(1, 1, 1);
    stale.macro = {
      ...stale.macro,
      state: null,
      score: null,
      status: "INSUFFICIENT_DATA",
      warnings: ["DXY_30D:STALE"],
    };
    const output = evaluateDecision(stale);
    expect(output.state).toBeNull();
    expect(output.status).toBe("INSUFFICIENT_DATA");
    expect(output.confidence).toBe("LOW");
  });
  it("assigns high confidence only to complete aligned inputs", () =>
    expect(evaluateDecision(input(1, 1, 1)).confidence).toBe("HIGH"));
  it("lowers confidence for incomplete data", () => {
    const value = input(1, 1, 1);
    value.macro = {
      ...value.macro,
      coverage: 2 / 3,
      warnings: ["DXY_30D:MISSING"],
    };
    expect(evaluateDecision(value).confidence).toBe("MEDIUM");
  });
  it("lowers confidence for contradictory regime directions", () =>
    expect(evaluateDecision(input(2, -2, 2)).confidence).toBe("MEDIUM"));
  it("includes drivers, contradictions and data warnings as structured facts", () => {
    const value = input(2, -2, 1);
    value.dataQualityIssues = [
      { code: "PROVIDER_DISCREPANCY", severity: "WARNING" },
    ];
    const output = evaluateDecision(value);
    expect(output.explanationFacts.positiveDrivers.length).toBeGreaterThan(0);
    expect(output.explanationFacts.negativeDrivers.length).toBeGreaterThan(0);
    expect(output.explanationFacts.contradictorySignals.length).toBeGreaterThan(
      0,
    );
    expect(output.explanationFacts.dataWarnings).toContain(
      "WARNING:PROVIDER_DISCREPANCY",
    );
  });
  it("publishes the versioned hypothesis configuration", () =>
    expect(PHASE_FOUR_CONFIG.version).toBe("0.4.0-hypothesis.1"));
});
