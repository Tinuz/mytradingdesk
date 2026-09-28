import type { InvestmentRegime, RegimeScore } from "@cmip/domain";
import { DECISION_MATRIX, PHASE_FOUR_CONFIG } from "./config";
import type {
  DecisionInput,
  DecisionOutput,
  ExplanationFact,
  FactorResult,
  RegimeResult,
  TransitionMemory,
} from "./types";

const rank: Record<InvestmentRegime, number> = {
  DEFENSIVE: -2,
  RISK_REDUCTION: -1,
  NEUTRAL: 0,
  ACCUMULATION: 1,
  STRONG_ACCUMULATION: 2,
};

function confidence(input: DecisionInput): DecisionOutput["confidence"] {
  const regimes = [input.macro, input.cryptoLiquidity, input.asset];
  const critical =
    input.dataQualityIssues?.some((issue) => issue.severity === "CRITICAL") ??
    false;
  const warning = input.dataQualityIssues?.length ?? 0;
  const complete = regimes.every(
    (regime) => regime.coverage === 1 && regime.warnings.length === 0,
  );
  const signs = new Set(
    regimes.flatMap((regime) =>
      regime.score === null || regime.score === 0
        ? []
        : [Math.sign(regime.score)],
    ),
  );
  if (
    critical ||
    regimes.some(
      (regime) => regime.status !== "AVAILABLE" || regime.coverage < 2 / 3,
    )
  )
    return "LOW";
  if (complete && warning === 0 && signs.size <= 1) return "HIGH";
  return "MEDIUM";
}

function facts(
  regime: "MACRO" | "CRYPTO_LIQUIDITY" | "ASSET",
  result: RegimeResult<string>,
): ExplanationFact[] {
  return result.factors
    .filter(
      (factor): factor is FactorResult & { score: RegimeScore } =>
        factor.status === "VALID" &&
        factor.score !== null &&
        factor.score !== 0,
    )
    .map((factor) => ({
      code: factor.code,
      regime,
      score: factor.score,
      description: factor.description,
    }));
}

function explanation(input: DecisionInput) {
  const all = [
    ...facts("MACRO", input.macro),
    ...facts("CRYPTO_LIQUIDITY", input.cryptoLiquidity),
    ...facts("ASSET", input.asset),
  ];
  const regimeScores = [
    input.macro.score,
    input.cryptoLiquidity.score,
    input.asset.score,
  ].filter((score): score is RegimeScore => score !== null && score !== 0);
  const direction = Math.sign(
    regimeScores.reduce<number>((sum, score) => sum + score, 0),
  );
  const warnings = [
    ...input.macro.warnings,
    ...input.cryptoLiquidity.warnings,
    ...input.asset.warnings,
    ...(input.dataQualityIssues ?? []).map(
      (issue) => `${issue.severity}:${issue.code}`,
    ),
  ];
  return {
    positiveDrivers: all.filter((item) => item.score > 0),
    negativeDrivers: all.filter((item) => item.score < 0),
    contradictorySignals:
      direction === 0
        ? all
        : all.filter((item) => Math.sign(item.score) !== direction),
    dataWarnings: warnings,
  };
}

function hysteresisAllows(
  current: InvestmentRegime,
  candidate: InvestmentRegime,
  total: number,
): boolean {
  if (rank[candidate] === rank[current]) return false;
  if (rank[candidate] > rank[current]) {
    if (candidate === "STRONG_ACCUMULATION")
      return total >= PHASE_FOUR_CONFIG.hysteresis.STRONG_ACCUMULATION.enter;
    if (candidate === "ACCUMULATION")
      return total >= PHASE_FOUR_CONFIG.hysteresis.ACCUMULATION.enter;
    return total >= PHASE_FOUR_CONFIG.hysteresis[current].exit;
  }
  if (candidate === "DEFENSIVE")
    return total <= PHASE_FOUR_CONFIG.hysteresis.DEFENSIVE.enter;
  if (candidate === "RISK_REDUCTION")
    return total <= PHASE_FOUR_CONFIG.hysteresis.RISK_REDUCTION.enter;
  return total <= PHASE_FOUR_CONFIG.hysteresis[current].exit;
}

export function evaluateDecision(input: DecisionInput): DecisionOutput {
  const previous = input.memory?.currentState ?? null;
  const base = {
    previousState: previous,
    confidence: confidence(input),
    explanationFacts: explanation(input),
    engineVersion: PHASE_FOUR_CONFIG.version,
  };
  if (input.shock) {
    const state = PHASE_FOUR_CONFIG.shockOverrides[input.shock];
    return {
      ...base,
      state,
      candidateState: state,
      status: "AVAILABLE",
      transitioned: state !== previous,
      transitionReason: "SHOCK_OVERRIDE",
      memory: {
        currentState: state,
        pendingState: null,
        consecutiveObservations: 0,
      },
    };
  }
  if (
    [input.macro, input.cryptoLiquidity, input.asset].some(
      (regime) => regime.status !== "AVAILABLE" || regime.score === null,
    )
  ) {
    return {
      ...base,
      state: previous,
      candidateState: null,
      status: "INSUFFICIENT_DATA",
      transitioned: false,
      transitionReason: "INSUFFICIENT_DATA",
      memory: input.memory ?? {
        currentState: null,
        pendingState: null,
        consecutiveObservations: 0,
      },
    };
  }
  const scores = [
    input.macro.score!,
    input.cryptoLiquidity.score!,
    input.asset.score!,
  ];
  const candidate = DECISION_MATRIX[scores.join(":")]!;
  if (previous === null)
    return {
      ...base,
      state: candidate,
      candidateState: candidate,
      status: "AVAILABLE",
      transitioned: true,
      transitionReason: "INITIAL",
      memory: {
        currentState: candidate,
        pendingState: null,
        consecutiveObservations: 0,
      },
    };
  if (candidate === previous)
    return {
      ...base,
      state: previous,
      candidateState: candidate,
      status: "AVAILABLE",
      transitioned: false,
      transitionReason: "HYSTERESIS_HELD",
      memory: {
        currentState: previous,
        pendingState: null,
        consecutiveObservations: 0,
      },
    };
  if (
    !hysteresisAllows(
      previous,
      candidate,
      scores.reduce<number>((sum, score) => sum + score, 0),
    )
  )
    return {
      ...base,
      state: previous,
      candidateState: candidate,
      status: "AVAILABLE",
      transitioned: false,
      transitionReason: "HYSTERESIS_HELD",
      memory: {
        currentState: previous,
        pendingState: null,
        consecutiveObservations: 0,
      },
    };
  const count =
    input.memory?.pendingState === candidate
      ? input.memory.consecutiveObservations + 1
      : 1;
  if (count < PHASE_FOUR_CONFIG.persistenceObservations)
    return {
      ...base,
      state: previous,
      candidateState: candidate,
      status: "AVAILABLE",
      transitioned: false,
      transitionReason: "PENDING_CONFIRMATION",
      memory: {
        currentState: previous,
        pendingState: candidate,
        consecutiveObservations: count,
      },
    };
  return {
    ...base,
    state: candidate,
    candidateState: candidate,
    status: "AVAILABLE",
    transitioned: true,
    transitionReason: "PERSISTENCE_CONFIRMED",
    memory: {
      currentState: candidate,
      pendingState: null,
      consecutiveObservations: 0,
    },
  };
}
