import { createClient } from "@supabase/supabase-js";
import { SupabaseIngestionRepository } from "@cmip/database";
import {
  BGeometricsProvider,
  CoinalyzeOpenInterestProvider,
  DefiLlamaLoansProvider,
  IngestionPipeline,
} from "@cmip/providers";
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
};
const repository = new SupabaseIngestionRepository(
  createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
);
const pipeline = new IngestionPipeline(repository);
const results = [];
const jobs = [
  {
    provider: new DefiLlamaLoansProvider(),
    indicator: "DEFI_ACTIVE_LOANS_USD" as const,
  },
  { provider: new BGeometricsProvider(), indicator: "BTC_MVRV" as const },
  {
    provider: new BGeometricsProvider(),
    indicator: "BTC_REALIZED_LOSSES_USD" as const,
  },
  {
    provider: new BGeometricsProvider(),
    indicator: "BTC_MARKET_CAP_USD" as const,
  },
  {
    provider: new CoinalyzeOpenInterestProvider(required("COINALYZE_API_KEY")),
    indicator: "BTC_PERPETUAL_OI_USD" as const,
  },
];
for (const job of jobs) {
  const result = await pipeline.fetchAndIngest(job.provider, job.indicator);
  results.push({
    indicator: job.indicator,
    provider: job.provider.name,
    ...result,
  });
}
console.log(
  JSON.stringify(
    {
      jobs: results,
      providerBudget: {
        bgeometricsRequests: 3,
        bgeometricsDailyLimit: 15,
        coinalyzeAggregateRequests: 10,
      },
    },
    null,
    2,
  ),
);
