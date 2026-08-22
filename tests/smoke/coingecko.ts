import { CoinGeckoProvider, DefiLlamaStablecoinProvider, FredLiquidityProvider, FredProvider, SoSoValueEtfProvider, TwelveDataProvider } from "../../packages/providers/src/adapters";

const provider = new CoinGeckoProvider(process.env.COINGECKO_API_KEY);
const to = new Date();
const from = new Date(to.getTime() - 60 * 60_000);

for (const indicator of ["BTC_USD", "ETH_USD"] as const) {
  const observations = await provider.fetchRange(indicator, from, to);
  const latest = observations.at(-1);
  console.log(JSON.stringify({ indicator, count: observations.length, latest: latest ? { observedAt: latest.observedAt.toISOString(), value: latest.value, unit: latest.unit } : null }));
}

if (!process.env.FRED_API_KEY) throw new Error("FRED_API_KEY is missing");
const fred = new FredProvider(process.env.FRED_API_KEY);
const realYield = await fred.fetchLatest("US10Y_REAL");
const latestYield = realYield.at(-1);
console.log(JSON.stringify({ indicator: "US10Y_REAL", count: realYield.length, latest: latestYield ? { observedAt: latestYield.observedAt.toISOString(), value: latestYield.value, unit: latestYield.unit } : null }));

if (!process.env.TWELVE_DATA_API_KEY) throw new Error("TWELVE_DATA_API_KEY is missing");
const twelveData = new TwelveDataProvider(process.env.TWELVE_DATA_API_KEY);
const fallbackBtc = await twelveData.fetchLatest("BTC_USD");
console.log(JSON.stringify({ indicator: "BTC_USD", provider: "twelve-data", role: "FALLBACK", count: fallbackBtc.length }));
console.log(JSON.stringify({ indicator: "DXY", status: "SOURCE_FAILURE", reason: "No licensed ICE DXY provider credentials configured" }));

const stablecoins = await new DefiLlamaStablecoinProvider().fetchLatest("STABLECOIN_SUPPLY_USD");
console.log(JSON.stringify({ indicator: "STABLECOIN_SUPPLY_USD", count: stablecoins.length, latest: stablecoins.at(-1) ? { observedAt: stablecoins.at(-1)!.observedAt.toISOString(), value: stablecoins.at(-1)!.value, unit: stablecoins.at(-1)!.unit } : null }));

const liquidity = await new FredLiquidityProvider(process.env.FRED_API_KEY).fetchLatest("US_NET_LIQUIDITY_USD");
console.log(JSON.stringify({ indicator: "US_NET_LIQUIDITY_USD", count: liquidity.length, latest: liquidity.at(-1) ? { observedAt: liquidity.at(-1)!.observedAt.toISOString(), value: liquidity.at(-1)!.value, unit: liquidity.at(-1)!.unit } : null }));

if (process.env.SOSOVALUE_API_KEY) {
  const provider = new SoSoValueEtfProvider(process.env.SOSOVALUE_API_KEY);
  for (const indicator of ["BTC_ETF_NET_FLOW_USD", "ETH_ETF_NET_FLOW_USD"] as const) {
    const values = await provider.fetchLatest(indicator);
    console.log(JSON.stringify({ indicator, count: values.length, latest: values.at(-1) ? { observedAt: values.at(-1)!.observedAt.toISOString(), value: values.at(-1)!.value, unit: values.at(-1)!.unit } : null }));
  }
} else {
  console.log(JSON.stringify({ indicators: ["BTC_ETF_NET_FLOW_USD", "ETH_ETF_NET_FLOW_USD"], status: "SOURCE_FAILURE", reason: "SOSOVALUE_API_KEY missing" }));
}
