import { loadEnvConfig } from "@next/env";
import { FredGlobalLiquidityProvider } from "@cmip/providers";

loadEnvConfig(process.cwd());
if (!process.env.FRED_API_KEY) throw new Error("FRED_API_KEY is missing");

const values = await new FredGlobalLiquidityProvider(
  process.env.FRED_API_KEY,
).fetchLatest("GLOBAL_LIQUIDITY_USD");
const latest = values.at(-1);
if (!latest)
  throw new Error("FRED returned no reconstructable G3 liquidity observation");

console.log(
  JSON.stringify({
    indicator: latest.indicator,
    count: values.length,
    latest: {
      observedAt: latest.observedAt.toISOString(),
      value: latest.value,
      unit: latest.unit,
    },
    methodologyVersion: (latest.payload as { methodologyVersion: string })
      .methodologyVersion,
  }),
);
