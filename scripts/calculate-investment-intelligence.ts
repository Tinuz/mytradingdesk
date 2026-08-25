import { createClient } from "@supabase/supabase-js";
const req = (n: string) => {
    const v = process.env[n];
    if (!v) throw new Error(`${n} missing`);
    return v;
  },
  db = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  ),
  at = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now());
async function latest(code: string) {
  const { data } = await db
    .from("canonical_observations")
    .select("id,value,observed_at,indicators!inner(code)")
    .eq("indicators.code", code)
    .lte("observed_at", at.toISOString())
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data
    ? { id: data.id, value: Number(data.value), observedAt: data.observed_at }
    : null;
}
const codes = [
    "BTC_MVRV",
    "BTC_REALIZED_LOSSES_USD",
    "BTC_ETF_NET_FLOW_USD",
    "BTC_USD",
    "ETH_USD",
    "ETH_ETF_NET_FLOW_USD",
    "STABLECOIN_SUPPLY_USD",
    "DEFI_ACTIVE_LOANS_USD",
    "BTC_PERPETUAL_OI_USD",
    "US10Y_REAL",
    "US_3M_TBILL_YIELD",
    "GLOBAL_LIQUIDITY_USD",
    "DXY_PROXY_ECB",
  ] as const,
  values = Object.fromEntries(
    await Promise.all(codes.map(async (code) => [code, await latest(code)])),
  );
const { data: assets, error } = await db
  .from("assets")
  .select("id,symbol")
  .in("symbol", ["BTC", "ETH"]);
if (error) throw error;
type Module =
  | "BTC_ONCHAIN"
  | "BTC_SUPPLY_DEMAND"
  | "ETH_ECONOMICS"
  | "RELATIVE_VALUE"
  | "QUALITY"
  | "MACRO_CYCLE"
  | "ROTATION"
  | "DERIVATIVES";
const rows: Array<Record<string, unknown>> = [];
function add(
  assetId: string,
  module: Module,
  requiredCodes: readonly string[],
  components: Record<string, unknown>,
  warnings: string[] = [],
) {
  const available = requiredCodes.filter((x) => values[x]),
    coverage = requiredCodes.length
      ? (available.length / requiredCodes.length) * 100
      : 0;
  rows.push({
    asset_id: assetId,
    calculated_at: at.toISOString(),
    module,
    methodology_version: `${module.toLowerCase()}-v1-shadow`,
    components: {
      ...components,
      requiredInputs: requiredCodes,
      availableInputs: available,
    },
    score: null,
    coverage_percent: coverage,
    source_observation_ids: available.map((x) => values[x].id),
    evidence_status: "SHADOW",
    warnings: [
      ...warnings,
      ...requiredCodes.filter((x) => !values[x]).map((x) => `MISSING:${x}`),
    ],
  });
}
for (const asset of assets ?? []) {
  if (asset.symbol === "BTC") {
    add(
      asset.id,
      "BTC_ONCHAIN",
      [
        "BTC_MVRV",
        "BTC_REALIZED_LOSSES_USD",
        "BTC_STH_LTH_COST_BASIS",
        "BTC_SOPR",
        "BTC_HOLDER_SUPPLY",
        "BTC_MINER_SELLING",
      ],
      {
        families: {
          mvrv: values.BTC_MVRV?.value ?? null,
          realizedLosses: values.BTC_REALIZED_LOSSES_USD?.value ?? null,
        },
        unavailableFamilies: [
          "STH_LTH_COST_BASIS",
          "SOPR",
          "HOLDER_SUPPLY",
          "MINER_SELLING",
        ],
      },
      ["Coverage, not neutral score, falls when on-chain families are absent"],
    );
    add(
      asset.id,
      "BTC_SUPPLY_DEMAND",
      [
        "BTC_ETF_NET_FLOW_USD",
        "BTC_REALIZED_LOSSES_USD",
        "BTC_ILLIQUID_SUPPLY_CHANGE",
        "BTC_EXCHANGE_NETFLOW",
      ],
      {
        etfFlow: values.BTC_ETF_NET_FLOW_USD?.value ?? null,
        realizedLosses: values.BTC_REALIZED_LOSSES_USD?.value ?? null,
        issuanceModel: "KNOWN_PROTOCOL_SCHEDULE",
        unavailable: ["ILLIQUID_SUPPLY_CHANGE", "EXCHANGE_NETFLOW"],
      },
      ["Flows are not valuation"],
    );
  } else
    add(
      asset.id,
      "ETH_ECONOMICS",
      [
        "ETH_FEES",
        "ETH_REVENUE",
        "ETH_ISSUANCE",
        "ETH_BURN",
        "ETH_STAKING_RATE",
        "ETH_BLOB_FEES",
        "ETH_MEV",
        "ETH_STABLECOIN_SHARE",
        "ETH_DEX_VOLUME",
      ],
      {
        fees: null,
        revenue: null,
        issuance: null,
        burn: null,
        netInflation: null,
        staking: null,
        blobs: null,
        mev: null,
        stablecoinShare: null,
        dexActivity: null,
        valueAccrualScore: null,
      },
      [
        "ETH RPC/DefiLlama source approval and historical vintage are required; activity does not score as holder value capture",
      ],
    );
  add(
    asset.id,
    "RELATIVE_VALUE",
    [
      asset.symbol === "BTC" ? "BTC_USD" : "ETH_USD",
      "US_3M_TBILL_YIELD",
      "US10Y_REAL",
    ],
    {
      alternative: "US_3M_TBILL",
      horizonMonths: 12,
      cashYield: values.US_3M_TBILL_YIELD?.value ?? null,
      realYield: values.US10Y_REAL?.value ?? null,
    },
    ["Attractiveness must name alternative and horizon"],
  );
  add(
    asset.id,
    "QUALITY",
    [
      "DEMAND_QUALITY",
      "UNIT_ECONOMICS",
      "TOKEN_DILUTION",
      "VALUE_CAPTURE",
      "DECENTRALIZATION_SECURITY",
      "ECOSYSTEM_CONCENTRATION",
    ],
    {
      dimensions: {
        demandQuality: null,
        unitEconomics: null,
        dilution: null,
        valueCapture: null,
        decentralizationSecurity: null,
        ecosystemConcentration: null,
      },
      weights: null,
    },
    ["No composite score until component weights pass sensitivity tests"],
  );
  add(
    asset.id,
    "MACRO_CYCLE",
    [
      "GLOBAL_LIQUIDITY_USD",
      "US10Y_REAL",
      "DXY_PROXY_ECB",
      "US_GROWTH",
      "US_INFLATION",
      "US_LABOR",
      "US_CREDIT_SPREADS",
      "US_LENDING_CONDITIONS",
      "US_FISCAL_IMPULSE",
    ],
    {
      growth: null,
      inflation: null,
      labor: null,
      creditSpreads: null,
      lendingConditions: null,
      fiscalImpulse: null,
      treasuryLiquidity: values.GLOBAL_LIQUIDITY_USD?.value ?? null,
    },
    [
      "Growth and liquidity remain independent; missing official macro vintages reduce coverage",
    ],
  );
  add(
    asset.id,
    "ROTATION",
    [
      "STABLECOIN_SUPPLY_USD",
      asset.symbol === "BTC" ? "BTC_ETF_NET_FLOW_USD" : "ETH_ETF_NET_FLOW_USD",
    ],
    {
      stablecoins: values.STABLECOIN_SUPPLY_USD?.value ?? null,
      etfFlow:
        values[
          asset.symbol === "BTC"
            ? "BTC_ETF_NET_FLOW_USD"
            : "ETH_ETF_NET_FLOW_USD"
        ]?.value ?? null,
      newCapitalClassification: "UNRESOLVED",
    },
    ["Cannot classify internal rotation as external capital without evidence"],
  );
  add(
    asset.id,
    "DERIVATIVES",
    asset.symbol === "BTC"
      ? [
          "BTC_PERPETUAL_OI_USD",
          "BTC_FUNDING",
          "BTC_FUTURES_BASIS",
          "BTC_LIQUIDATIONS",
          "BTC_OPTIONS_SKEW",
        ]
      : [
          "ETH_PERPETUAL_OI_USD",
          "ETH_FUNDING",
          "ETH_FUTURES_BASIS",
          "ETH_LIQUIDATIONS",
          "ETH_OPTIONS_SKEW",
        ],
    {
      openInterest:
        asset.symbol === "BTC"
          ? (values.BTC_PERPETUAL_OI_USD?.value ?? null)
          : null,
      funding: null,
      basis: null,
      liquidations: null,
      optionsSkew: null,
      venueCoverage: asset.symbol === "BTC" ? ["configured-source"] : [],
    },
    ["Open interest alone cannot determine direction"],
  );
}
const saved = await db.from("fundamental_snapshots").upsert(rows, {
  onConflict: "asset_id,calculated_at,module,methodology_version",
  ignoreDuplicates: true,
});
if (saved.error) throw saved.error;
console.log(
  JSON.stringify(
    {
      calculatedAt: at.toISOString(),
      modules: rows.length,
      coverage: rows.map((x) => ({
        module: x.module,
        coverage: x.coverage_percent,
      })),
    },
    null,
    2,
  ),
);
