import type {
  EngineIndicator,
  EngineObservation,
  FactorResult,
  ObservationSeries,
} from "./types";
import { PHASE_THREE_CONFIG } from "./config";
import type { RegimeScore } from "@cmip/domain";

export function validSeries(
  series: ObservationSeries,
  indicator: EngineIndicator,
  asOf: Date,
): EngineObservation[] {
  return [...(series[indicator] ?? [])]
    .filter((item) => item.quality === "VALID" && item.observedAt <= asOf)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
}
export function freshnessStatus(
  items: readonly EngineObservation[],
  indicator: EngineIndicator,
  asOf: Date,
) {
  if (!items.length) return "MISSING" as const;
  return asOf.getTime() - items.at(-1)!.observedAt.getTime() >
    PHASE_THREE_CONFIG.freshnessSeconds[indicator] * 1_000
    ? ("STALE" as const)
    : ("VALID" as const);
}
export function percentChange(
  items: readonly EngineObservation[],
  days: number,
): number | null {
  if (items.length < 2) return null;
  const latest = items.at(-1)!;
  const cutoff = latest.observedAt.getTime() - days * 86_400_000;
  const prior = [...items]
    .reverse()
    .find((item) => item.observedAt.getTime() <= cutoff);
  if (!prior || prior.value === 0) return null;
  return ((latest.value - prior.value) / Math.abs(prior.value)) * 100;
}
export function sumRecent(
  items: readonly EngineObservation[],
  days: number,
): number | null {
  if (!items.length) return null;
  const cutoff = items.at(-1)!.observedAt.getTime() - (days - 1) * 86_400_000;
  const selected = items.filter((item) => item.observedAt.getTime() >= cutoff);
  return selected.length
    ? selected.reduce((sum, item) => sum + item.value, 0)
    : null;
}
export function movingAverage(
  items: readonly EngineObservation[],
  periods: number,
): number | null {
  if (items.length < periods) return null;
  return (
    items.slice(-periods).reduce((sum, item) => sum + item.value, 0) / periods
  );
}
export function scoreSymmetric(
  value: number,
  strong: number,
  moderate: number,
): RegimeScore {
  if (value >= strong) return 2;
  if (value >= moderate) return 1;
  if (value <= -strong) return -2;
  if (value <= -moderate) return -1;
  return 0;
}
export function aggregate(
  factors: readonly FactorResult[],
  minimumCoverage: number,
  blockStrongOnMissing = true,
) {
  const valid = factors.filter(
    (factor): factor is FactorResult & { score: RegimeScore } =>
      factor.status === "VALID" && factor.score !== null,
  );
  const coverage = factors.length ? valid.length / factors.length : 0;
  if (coverage < minimumCoverage || valid.length === 0)
    return { score: null, coverage };
  const familyScores = new Map<string, number[]>();
  for (const factor of valid) {
    const scores = familyScores.get(factor.family) ?? [];
    scores.push(factor.score);
    familyScores.set(factor.family, scores);
  }
  const familyAverages = [...familyScores.values()].map(
    (scores) => scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
  const average =
    familyAverages.reduce((sum, score) => sum + score, 0) /
    familyAverages.length;
  let score: RegimeScore =
    average >= 1.5
      ? 2
      : average >= 0.5
        ? 1
        : average <= -1.5
          ? -2
          : average <= -0.5
            ? -1
            : 0;
  if (blockStrongOnMissing && coverage < 1 && Math.abs(score) === 2)
    score = score > 0 ? 1 : -1;
  return { score, coverage };
}
