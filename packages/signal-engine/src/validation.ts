import type { InvestmentRegime } from "@cmip/domain";
export const VALIDATION_HORIZONS = [30, 90, 180, 365] as const;
export type ValidationHorizon = (typeof VALIDATION_HORIZONS)[number];
export interface PricePoint {
  date: string;
  value: number;
}
export interface Outcome {
  forwardReturn: number | null;
  adverseExcursion: number | null;
}
export function outcomeAt(
  prices: readonly PricePoint[],
  index: number,
  horizon: number,
): Outcome {
  const start = prices[index],
    end = prices[index + horizon];
  if (!start || !end || start.value === 0)
    return { forwardReturn: null, adverseExcursion: null };
  const low = Math.min(
    ...prices.slice(index + 1, index + horizon + 1).map((x) => x.value),
  );
  return {
    forwardReturn: (end.value / start.value - 1) * 100,
    adverseExcursion: (low / start.value - 1) * 100,
  };
}
export interface ValidationPoint {
  date: string;
  asset: "BTC" | "ETH";
  decision: InvestmentRegime;
  transitioned: boolean;
  price: number;
  forwardReturns: Partial<Record<ValidationHorizon, number | null>>;
  adverseExcursions: Partial<Record<ValidationHorizon, number | null>>;
}
type Metric = {
  samples: number;
  meanForwardReturn: number | null;
  meanAdverseExcursion: number | null;
};
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const metric = (
  selected: readonly ValidationPoint[],
  horizon: ValidationHorizon,
): Metric => {
  const eligible = selected.filter((x) => x.forwardReturns[horizon] != null);
  return {
    samples: eligible.length,
    meanForwardReturn: mean(eligible.map((x) => x.forwardReturns[horizon]!)),
    meanAdverseExcursion: mean(
      eligible.map((x) => x.adverseExcursions[horizon]!),
    ),
  };
};
const independent = (
  selected: readonly ValidationPoint[],
  horizon: ValidationHorizon,
) => {
  const ordered = [...selected].sort((a, b) => a.date.localeCompare(b.date)),
    output: ValidationPoint[] = [];
  let nextDay = Number.NEGATIVE_INFINITY;
  for (const point of ordered) {
    const day = Date.parse(`${point.date}T00:00:00Z`) / 86_400_000;
    if (day >= nextDay && point.forwardReturns[horizon] != null) {
      output.push(point);
      nextDay = day + horizon;
    }
  }
  return output;
};
export function summarizeValidation(points: readonly ValidationPoint[]) {
  const byAsset = {} as Record<
      "BTC" | "ETH",
      Record<ValidationHorizon, Metric>
    >,
    byDecision: Record<string, Record<string, Metric>> = {},
    nonOverlappingByDecision: Record<string, Record<string, Metric>> = {};
  for (const asset of ["BTC", "ETH"] as const) {
    const assetPoints = points.filter((x) => x.asset === asset),
      metrics = {} as Record<ValidationHorizon, Metric>;
    for (const horizon of VALIDATION_HORIZONS)
      metrics[horizon] = metric(assetPoints, horizon);
    byAsset[asset] = metrics;
    for (const decision of [...new Set(assetPoints.map((x) => x.decision))]) {
      const selected = assetPoints.filter((x) => x.decision === decision),
        key = `${asset}:${decision}`;
      byDecision[key] = Object.fromEntries(
        VALIDATION_HORIZONS.map((horizon) => [
          horizon,
          metric(selected, horizon),
        ]),
      );
      nonOverlappingByDecision[key] = Object.fromEntries(
        VALIDATION_HORIZONS.map((horizon) => [
          horizon,
          metric(independent(selected, horizon), horizon),
        ]),
      );
    }
  }
  return {
    points: points.length,
    transitions: points.filter((x) => x.transitioned).length,
    byAsset,
    byDecision,
    nonOverlappingByDecision,
  };
}
