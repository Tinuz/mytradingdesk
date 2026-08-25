import { createClient } from "@supabase/supabase-js";
import { SupabaseIngestionRepository } from "../packages/database/src/ingestion-repository";
import {
  CoinGeckoProvider,
  DefiLlamaStablecoinProvider,
  EcbDxyProxyProvider,
  EcbEurUsdProvider,
  FredBroadDollarProvider,
  FredGlobalLiquidityProvider,
  FredLiquidityProvider,
  FredProvider,
  IngestionPipeline,
  SoSoValueEtfProvider,
  TwelveDataProvider,
} from "../packages/providers/src";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
};

async function main() {
  const repository = new SupabaseIngestionRepository(
    createClient(
      required("NEXT_PUBLIC_SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
  );
  const pipeline = new IngestionPipeline(repository);
  const coinGecko = new CoinGeckoProvider(process.env.COINGECKO_API_KEY);
  const fred = new FredProvider(required("FRED_API_KEY"));
  const twelveData = new TwelveDataProvider(required("TWELVE_DATA_API_KEY"));
  const eurUsdProvider=new EcbEurUsdProvider();
  const eurUsd=await pipeline.fetchAndIngest(eurUsdProvider,"EUR_USD");console.log(JSON.stringify({indicator:"EUR_USD",provider:eurUsdProvider.name,...eurUsd}));

  for (const indicator of ["BTC_USD", "ETH_USD"] as const) {
    const result = await pipeline.fetchAndIngest(coinGecko, indicator);
    console.log(
      JSON.stringify({
        indicator,
        provider: coinGecko.name,
        ...result,
        freshness: await pipeline.evaluateFreshness(indicator, coinGecko.name),
      }),
    );
  }

  const realYield = await pipeline.fetchAndIngest(fred, "US10Y_REAL");
  console.log(
    JSON.stringify({
      indicator: "US10Y_REAL",
      provider: fred.name,
      ...realYield,
      freshness: await pipeline.evaluateFreshness("US10Y_REAL", fred.name),
    }),
  );

  const fallbackBtc = await pipeline.fetchAndIngest(twelveData, "BTC_USD");
  console.log(
    JSON.stringify({
      indicator: "BTC_USD",
      provider: twelveData.name,
      role: twelveData.role,
      ...fallbackBtc,
    }),
  );
  console.log(
    JSON.stringify({
      indicator: "DXY",
      status: "SOURCE_FAILURE",
      reason:
        "Official ICE source remains unlicensed; shadow proxies never populate DXY.",
    }),
  );

  for (const [provider, indicator] of [
    [new EcbDxyProxyProvider(), "DXY_PROXY_ECB"],
    [
      new FredBroadDollarProvider(required("FRED_API_KEY")),
      "US_BROAD_DOLLAR_INDEX",
    ],
  ] as const) {
    const result = await pipeline.fetchAndIngest(provider, indicator);
    console.log(
      JSON.stringify({
        indicator,
        provider: provider.name,
        mode:
          indicator === "DXY_PROXY_ECB"
            ? "ACTIVE_HYPOTHESIS"
            : "VALIDATION_ONLY",
        ...result,
        freshness: await pipeline.evaluateFreshness(indicator, provider.name),
      }),
    );
  }

  for (const [provider, indicator] of [
    [new DefiLlamaStablecoinProvider(), "STABLECOIN_SUPPLY_USD"],
    [
      new FredLiquidityProvider(required("FRED_API_KEY")),
      "US_NET_LIQUIDITY_USD",
    ],
    [
      new FredGlobalLiquidityProvider(required("FRED_API_KEY")),
      "GLOBAL_LIQUIDITY_USD",
    ],
  ] as const) {
    const result = await pipeline.fetchAndIngest(provider, indicator);
    console.log(
      JSON.stringify({
        indicator,
        provider: provider.name,
        ...result,
        freshness: await pipeline.evaluateFreshness(indicator, provider.name),
      }),
    );
  }

  if (process.env.SOSOVALUE_API_KEY) {
    const provider = new SoSoValueEtfProvider(process.env.SOSOVALUE_API_KEY);
    for (const indicator of [
      "BTC_ETF_NET_FLOW_USD",
      "ETH_ETF_NET_FLOW_USD",
    ] as const) {
      const result = await pipeline.fetchAndIngest(provider, indicator);
      console.log(
        JSON.stringify({
          indicator,
          provider: provider.name,
          ...result,
          freshness: await pipeline.evaluateFreshness(indicator, provider.name),
        }),
      );
    }
  } else {
    console.log(
      JSON.stringify({
        indicators: ["BTC_ETF_NET_FLOW_USD", "ETH_ETF_NET_FLOW_USD"],
        status: "SOURCE_FAILURE",
      }),
    );
  }
}

main().catch((error: unknown) => {
  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  console.error(
    JSON.stringify({
      code: value.code ?? "UNKNOWN",
      message: value.message ?? "ingestion failed",
      details: value.details,
      hint: value.hint,
    }),
  );
  process.exitCode = 1;
});
