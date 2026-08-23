import {
  EcbDxyProxyProvider,
  FredBroadDollarProvider,
} from "../../packages/providers/src";

const to = new Date();
const from = new Date(to.getTime() - 14 * 86_400_000);
const ecb = await new EcbDxyProxyProvider().fetchRange(
  "DXY_PROXY_ECB",
  from,
  to,
);
const result: Record<string, unknown> = {
  DXY_PROXY_ECB: ecb.at(-1)
    ? {
        observedAt: ecb.at(-1)!.observedAt.toISOString(),
        value: ecb.at(-1)!.value,
      }
    : null,
};
if (process.env.FRED_API_KEY) {
  const fred = await new FredBroadDollarProvider(
    process.env.FRED_API_KEY,
  ).fetchRange("US_BROAD_DOLLAR_INDEX", from, to);
  result.US_BROAD_DOLLAR_INDEX = fred.at(-1)
    ? {
        observedAt: fred.at(-1)!.observedAt.toISOString(),
        value: fred.at(-1)!.value,
      }
    : null;
} else {
  result.US_BROAD_DOLLAR_INDEX = "SKIPPED: FRED_API_KEY missing";
}
console.log(JSON.stringify(result, null, 2));
