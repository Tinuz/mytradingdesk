import {
  OUTCOME_HORIZON_DAYS,
  RECOMMENDATION_OUTCOME_VERSION,
  recommendationOutcome,
  type ObservedPrice,
} from "@cmip/signal-engine";
import { calculationTime, fetchAllPages, serviceClient } from "./lib/runtime";

const db = serviceClient();
const now = calculationTime();
const DAY_MS = 86_400_000;

const recommendations = await fetchAllPages((from, to) =>
  db
    .from("allocation_recommendations")
    .select("id,calculated_at,target_ranges")
    .lte("calculated_at", new Date(now.getTime() - DAY_MS).toISOString())
    .order("calculated_at")
    .range(from, to),
);
const existing = await fetchAllPages((from, to) =>
  db
    .from("recommendation_outcomes")
    .select("recommendation_id,horizon_days")
    .eq("calculation_version", RECOMMENDATION_OUTCOME_VERSION)
    .order("id")
    .range(from, to),
);
const done = new Set(
  existing.map((x) => `${x.recommendation_id}:${x.horizon_days}`),
);
const pending = recommendations.flatMap((r) =>
  OUTCOME_HORIZON_DAYS.filter(
    (days) =>
      !done.has(`${r.id}:${days}`) &&
      new Date(r.calculated_at).getTime() + days * DAY_MS <= now.getTime(),
  ).map((days) => ({ recommendation: r, days })),
);

async function validPrices(
  code: string,
  since: Date,
): Promise<ObservedPrice[]> {
  const rows = await fetchAllPages((from, to) =>
    db
      .from("canonical_observations")
      .select("id,value,observed_at,indicators!inner(code)")
      .eq("indicators.code", code)
      .eq("quality_status", "VALID")
      .gte("observed_at", since.toISOString())
      .lte("observed_at", now.toISOString())
      .order("observed_at")
      .range(from, to),
  );
  return rows.map((x) => ({
    id: x.id as string,
    observedAt: new Date(x.observed_at),
    value: Number(x.value),
  }));
}

let written = 0;
let unavailable = 0;
if (pending.length) {
  // One read per asset, starting a day before the oldest pending entry.
  const since = new Date(
    Math.min(
      ...pending.map((x) => new Date(x.recommendation.calculated_at).getTime()),
    ) - DAY_MS,
  );
  const [btc, eth] = await Promise.all([
    validPrices("BTC_USD", since),
    validPrices("ETH_USD", since),
  ]);
  const rows = pending.flatMap(({ recommendation: r, days }) => {
    const targets = r.target_ranges as Record<string, { midpoint?: number }>;
    const outcome = recommendationOutcome({
      calculatedAt: new Date(r.calculated_at),
      horizonDays: days,
      weightsPercent: {
        BTC: Number(targets.BTC?.midpoint ?? 0),
        ETH: Number(targets.ETH?.midpoint ?? 0),
      },
      btc,
      eth,
    });
    if (!outcome) {
      unavailable++;
      return [];
    }
    return [
      {
        recommendation_id: r.id,
        horizon_days: days,
        observed_at: outcome.observedAt.toISOString(),
        asset_returns: outcome.assetReturnsPercent,
        portfolio_return_percent: outcome.portfolioReturnPercent,
        benchmark_return_percent: outcome.assetReturnsPercent.BTC,
        adverse_excursion_percent: outcome.adverseExcursionPercent,
        favorable_excursion_percent: outcome.favorableExcursionPercent,
        outcome_status: "OBSERVED",
        price_observation_ids: outcome.priceObservationIds,
        calculation_version: RECOMMENDATION_OUTCOME_VERSION,
      },
    ];
  });
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await db
      .from("recommendation_outcomes")
      .upsert(rows.slice(offset, offset + 500), {
        onConflict: "recommendation_id,horizon_days,calculation_version",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
  written = rows.length;
}
console.log(
  JSON.stringify(
    {
      calculatedAt: now.toISOString(),
      calculationVersion: RECOMMENDATION_OUTCOME_VERSION,
      pending: pending.length,
      outcomes: written,
      awaitingPrices: unavailable,
    },
    null,
    2,
  ),
);
