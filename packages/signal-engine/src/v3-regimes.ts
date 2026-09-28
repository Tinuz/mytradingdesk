import type {
  AssetRegime,
  CryptoCreditLiquidityRegime,
  FactorClassification,
  FactorFamily,
  MacroLiquidityRegime,
  MarketStructureRegime,
  RegimeScore,
} from "@cmip/domain";
import { V3_REGIME_CONFIG as C } from "./v3-config";
import type {
  RegimeResult,
  V3EngineIndicator,
  V3EngineObservation,
  V3FactorResult,
  V3ObservationSeries,
  V3RegimeInput,
  V3RegimeOutput,
} from "./types";
const DAY = 86_400_000;
const liquidity: Record<RegimeScore, MacroLiquidityRegime> = {
  [-2]: "STRONGLY_CONTRACTING",
  [-1]: "CONTRACTING",
  0: "NEUTRAL",
  1: "EXPANDING",
  2: "STRONGLY_EXPANDING",
};
const market: Record<RegimeScore, MarketStructureRegime> = {
  [-2]: "CAPITULATION",
  [-1]: "STRESSED",
  0: "HEALTHY",
  1: "ELEVATED_RISK",
  2: "OVERHEATED",
};
const asset: Record<RegimeScore, AssetRegime> = {
  [-2]: "STRONGLY_NEGATIVE",
  [-1]: "NEGATIVE",
  0: "NEUTRAL",
  1: "POSITIVE",
  2: "STRONGLY_POSITIVE",
};
type V3Factor = V3FactorResult;
const series = (
  all: V3ObservationSeries,
  code: V3EngineIndicator,
  asOf: Date,
) => {
  const rows = [...(all[code] ?? [])]
    .filter((x) => x.observedAt <= asOf)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  if (rows.at(-1)?.quality !== "VALID") return [];
  return rows.filter((x) => x.quality === "VALID");
};
const latest = (
  all: V3ObservationSeries,
  code: V3EngineIndicator,
  asOf: Date,
) => series(all, code, asOf).at(-1);
const before = (rows: readonly V3EngineObservation[], target: number) => {
  for (let i = rows.length - 1; i >= 0; i--)
    if (rows[i]!.observedAt.getTime() <= target) return rows[i];
};
const change = (rows: readonly V3EngineObservation[], days: number) => {
  const now = rows.at(-1);
  const old = now && before(rows, now.observedAt.getTime() - days * DAY);
  return now && old && old.value !== 0
    ? ((now.value - old.value) / old.value) * 100
    : null;
};
const score = (v: number, strong: number, moderate: number): RegimeScore =>
  v >= strong
    ? 2
    : v >= moderate
      ? 1
      : v <= -strong
        ? -2
        : v <= -moderate
          ? -1
          : 0;
const rounded = (v: number): RegimeScore =>
  v >= 1.5 ? 2 : v >= 0.5 ? 1 : v <= -1.5 ? -2 : v <= -0.5 ? -1 : 0;
function f(
  code: string,
  family: FactorFamily,
  classification: FactorClassification,
  raw: number | null,
  value: RegimeScore | null,
  description: string,
  status: V3Factor["status"] = "VALID",
): V3Factor {
  return {
    code,
    family,
    classification,
    classificationStatus: "HYPOTHESIS",
    rawValue: raw,
    score: value,
    description,
    status:
      raw === null || value === null
        ? status === "VALID"
          ? "INSUFFICIENT_HISTORY"
          : status
        : status,
  };
}
function aggregate<T extends string>(
  factors: V3Factor[],
  states: Record<RegimeScore, T>,
  minimum: number,
): RegimeResult<T, V3Factor> {
  const valid = factors.filter((x) => x.status === "VALID" && x.score !== null);
  const families = new Map<FactorFamily, number[]>();
  for (const x of valid) {
    const values = families.get(x.family) ?? [];
    values.push(x.score!);
    families.set(x.family, values);
  }
  const familyScores = [...families.values()].map(
    (v) => v.reduce((a, b) => a + b, 0) / v.length,
  );
  const final =
    familyScores.length >= minimum
      ? rounded(familyScores.reduce((a, b) => a + b, 0) / familyScores.length)
      : null;
  return {
    state: final === null ? null : states[final],
    score: final,
    status: final === null ? "INSUFFICIENT_DATA" : "AVAILABLE",
    coverage: factors.length ? valid.length / factors.length : 0,
    factors,
    warnings: factors
      .filter((x) => x.status !== "VALID")
      .map((x) => `${x.code}:${x.status}`),
  };
}
function marketAggregate(
  factors: V3Factor[],
): RegimeResult<MarketStructureRegime, V3Factor> {
  const valid = factors.filter((x) => x.status === "VALID" && x.score !== null);
  const families = new Map<FactorFamily, number[]>();
  for (const x of valid) {
    const values = families.get(x.family) ?? [];
    values.push(x.score!);
    families.set(x.family, values);
  }
  const familyScores = [...families.values()].map((values) =>
    rounded(values.reduce((a, b) => a + b, 0) / values.length),
  );
  let final: RegimeScore | null = null;
  if (familyScores.length >= C.minimumFamilies.marketStructure) {
    const positive = familyScores.filter((x) => x > 0),
      negative = familyScores.filter((x) => x < 0);
    final =
      negative.includes(-2) || negative.length >= 2
        ? -2
        : negative.length === 1
          ? -1
          : positive.includes(2) && positive.length >= 2
            ? 2
            : positive.length >= 1
              ? 1
              : 0;
  }
  return {
    state: final === null ? null : market[final],
    score: final,
    status: final === null ? "INSUFFICIENT_DATA" : "AVAILABLE",
    coverage: factors.length ? valid.length / factors.length : 0,
    factors,
    warnings: factors
      .filter((x) => x.status !== "VALID")
      .map((x) => `${x.code}:${x.status}`),
  };
}
const direct = (
  input: V3RegimeInput,
  code: V3EngineIndicator,
  days: number,
  strong: number,
  moderate: number,
) => {
  const raw = change(series(input.observations, code, input.asOf), days);
  return { raw, value: raw === null ? null : score(raw, strong, moderate) };
};
export function evaluateV3Macro(input: V3RegimeInput) {
  const g = direct(
    input,
    "GLOBAL_LIQUIDITY_USD",
    90,
    C.thresholds.globalLiquidity90d[1],
    C.thresholds.globalLiquidity90d[0],
  );
  const u = direct(
    input,
    "US_NET_LIQUIDITY_USD",
    90,
    C.thresholds.usLiquidity90d[1],
    C.thresholds.usLiquidity90d[0],
  );
  const realRows = series(input.observations, "US10Y_REAL", input.asOf),
    realNow = realRows.at(-1),
    realOld =
      realNow && before(realRows, realNow.observedAt.getTime() - 30 * DAY),
    realRaw = realNow && realOld ? realNow.value - realOld.value : null;
  const realScore =
    realRaw === null
      ? null
      : score(
          -realRaw,
          C.thresholds.realYield30d[1],
          C.thresholds.realYield30d[0],
        );
  const proxySource = [...(input.observations.DXY_PROXY_ECB ?? [])]
    .filter((row) => row.observedAt <= input.asOf)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const proxyRaw = change(
    series(input.observations, "DXY_PROXY_ECB", input.asOf),
    90,
  );
  const proxyStatus: V3Factor["status"] = !proxySource.length
    ? "MISSING"
    : proxySource.at(-1)?.quality !== "VALID"
      ? "STALE"
      : proxyRaw === null
        ? "INSUFFICIENT_HISTORY"
        : "VALID";
  const proxyScore: RegimeScore | null =
    proxyRaw === null
      ? null
      : proxyRaw <= -C.thresholds.dollarStrengthEcb90d
        ? 1
        : proxyRaw >= C.thresholds.dollarStrengthEcb90d
          ? -1
          : 0;
  const broadSource = [...(input.observations.US_BROAD_DOLLAR_INDEX ?? [])]
    .filter((row) => row.observedAt <= input.asOf)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const broadRaw = change(
    series(input.observations, "US_BROAD_DOLLAR_INDEX", input.asOf),
    90,
  );
  const validationWarnings =
    !broadSource.length ||
    broadSource.at(-1)?.quality !== "VALID" ||
    broadRaw === null
      ? ["DOLLAR_STRENGTH_VALIDATION:UNAVAILABLE"]
      : proxyRaw !== null && Math.sign(proxyRaw) !== Math.sign(broadRaw)
        ? ["DOLLAR_STRENGTH_VALIDATION:DIRECTION_DIVERGENCE"]
        : [];
  const result = aggregate(
    [
      f(
        "GLOBAL_LIQUIDITY_90D",
        "GLOBAL_LIQUIDITY",
        "LEADING",
        g.raw,
        g.value,
        "G3 central-bank assets 90-day change",
      ),
      f(
        "US_LIQUIDITY_90D",
        "US_LIQUIDITY",
        "LEADING",
        u.raw,
        u.value,
        "US net liquidity 90-day change",
      ),
      f(
        "REAL_YIELD_30D",
        "RATES_AND_DOLLAR",
        "CONTEXT",
        realRaw,
        realScore,
        "Inverse real-yield change",
      ),
      f(
        "DOLLAR_STRENGTH_ECB_90D",
        "RATES_AND_DOLLAR",
        "CONTEXT",
        proxyRaw,
        proxyScore,
        "Inverse 90-day ECB-derived dollar-strength change; maximum contribution +/-1",
        proxyStatus,
      ),
    ],
    liquidity,
    C.minimumFamilies.macro,
  );
  return { ...result, warnings: [...result.warnings, ...validationWarnings] };
}
export function evaluateV3CryptoCredit(input: V3RegimeInput) {
  const value = (code: V3EngineIndicator) =>
    latest(input.observations, code, input.asOf)?.value ?? null;
  const s30 = value("STABLECOIN_GROWTH_30D_PERCENT"),
    s90 = value("STABLECOIN_GROWTH_90D_PERCENT"),
    acc = value("STABLECOIN_GROWTH_ACCELERATION_PP"),
    loans = value("DEFI_LOANS_GROWTH_30D_PERCENT"),
    btc = value("BTC_ETF_FLOW_20D_USD"),
    eth = value("ETH_ETF_FLOW_20D_USD");
  return aggregate(
    [
      f(
        "STABLECOIN_30D",
        "STABLECOIN_LIQUIDITY",
        "LEADING",
        s30,
        s30 === null ? null : score(s30, 2, 0.5),
        "Stablecoin 30-day growth",
      ),
      f(
        "STABLECOIN_90D",
        "STABLECOIN_LIQUIDITY",
        "CONFIRMING",
        s90,
        s90 === null ? null : score(s90, 4, 1),
        "Stablecoin 90-day growth",
      ),
      f(
        "STABLECOIN_ACCELERATION",
        "STABLECOIN_LIQUIDITY",
        "LEADING",
        acc,
        acc === null ? null : score(acc, 1.5, 0.5),
        "Stablecoin growth acceleration",
      ),
      f(
        "DEFI_LOANS_30D",
        "ONCHAIN_CREDIT",
        "LEADING",
        loans,
        loans === null ? null : score(loans, 8, 2),
        "Active DeFi loans 30-day growth",
      ),
      f(
        "BTC_ETF_20D",
        "INSTITUTIONAL_FLOWS",
        "CONFIRMING",
        btc,
        btc === null ? null : score(btc, 2e9, 5e8),
        "BTC ETF rolling 20-session flow",
      ),
      f(
        "ETH_ETF_20D",
        "INSTITUTIONAL_FLOWS",
        "CONFIRMING",
        eth,
        eth === null ? null : score(eth, 4e8, 1e8),
        "ETH ETF rolling 20-session flow",
      ),
    ],
    liquidity,
    C.minimumFamilies.cryptoCredit,
  ) as RegimeResult<CryptoCreditLiquidityRegime, V3Factor>;
}
export function evaluateV3MarketStructure(input: V3RegimeInput) {
  const value = (code: V3EngineIndicator) =>
    latest(input.observations, code, input.asOf)?.value ?? null;
  const m = value("BTC_MVRV"),
    ratio = value("BTC_OI_MARKET_CAP_RATIO"),
    oi = value("BTC_PERPETUAL_OI_USD");
  const drawdown =
    oi === null
      ? null
      : (() => {
          const rows = series(
            input.observations,
            "BTC_PERPETUAL_OI_USD",
            input.asOf,
          );
          const high = Math.max(...rows.map((x) => x.value));
          return high ? (oi / high - 1) * 100 : null;
        })();
  const loss = value("BTC_REALIZED_LOSSES_USD"),
    marketCap = value("BTC_MARKET_CAP_USD");
  const lossRatio = loss !== null && marketCap ? loss / marketCap : null;
  const mScore: RegimeScore | null =
    m === null
      ? null
      : m <= 0.9
        ? -2
        : m < 1.2
          ? -1
          : m >= 3.5
            ? 2
            : m >= 2.5
              ? 1
              : 0;
  const ratioScore: RegimeScore | null =
    ratio === null ? null : ratio >= 0.04 ? 2 : ratio >= 0.025 ? 1 : 0;
  const ddScore: RegimeScore | null =
    drawdown === null ? null : drawdown <= -50 ? -2 : drawdown <= -25 ? -1 : 0;
  const lossScore: RegimeScore | null =
    lossRatio === null
      ? null
      : lossRatio >= 0.02
        ? -2
        : lossRatio >= 0.005
          ? -1
          : 0;
  return marketAggregate([
    f(
      "BTC_MVRV",
      "ONCHAIN_VALUATION",
      "RISK",
      m,
      mScore,
      "MVRV valuation and capital-base state",
    ),
    f(
      "BTC_OI_MARKET_CAP",
      "DERIVATIVES_LEVERAGE",
      "RISK",
      ratio,
      ratioScore,
      "Perpetual OI normalized by market cap",
    ),
    f(
      "BTC_OI_DRAWDOWN",
      "DERIVATIVES_LEVERAGE",
      "RISK",
      drawdown,
      ddScore,
      "OI deleveraging from observed high",
    ),
    f(
      "BTC_REALIZED_LOSS_SHARE",
      "CAPITULATION",
      "RISK",
      lossRatio,
      lossScore,
      "Realized loss as share of market cap",
    ),
  ]);
}
function assetRegime(symbol: "BTC" | "ETH", input: V3RegimeInput) {
  const code = `${symbol}_USD` as V3EngineIndicator;
  const rows = series(input.observations, code, input.asOf);
  const now = rows.at(-1);
  const daily = [
    ...new Map(
      rows.map((x) => [x.observedAt.toISOString().slice(0, 10), x]),
    ).values(),
  ];
  const ma = (n: number, offset = 0) =>
    daily.length >= n + offset
      ? daily
          .slice(daily.length - n - offset, daily.length - offset || undefined)
          .reduce((a, b) => a + b.value, 0) / n
      : null;
  const ma200 = ma(200),
    ma50 = ma(50),
    old50 = ma(50, 20);
  const distance = now && ma200 ? ((now.value - ma200) / ma200) * 100 : null;
  const slope = ma50 && old50 ? ((ma50 - old50) / old50) * 100 : null;
  // One-year high over daily closes: counting observations would shrink the
  // window to weeks once intraday data accumulates.
  const high = daily.length
    ? Math.max(...daily.slice(-365).map((x) => x.value))
    : null;
  const draw = now && high ? ((now.value - high) / high) * 100 : null;
  const factors: V3Factor[] = [
    f(
      `${symbol}_PRICE_VS_200DMA`,
      "ASSET_TREND",
      "CONFIRMING",
      distance,
      distance === null ? null : score(distance, 10, 0.01),
      "Price distance from 200DMA",
    ),
    f(
      `${symbol}_50DMA_SLOPE`,
      "ASSET_TREND",
      "CONFIRMING",
      slope,
      slope === null ? null : score(slope, 3, 0.01),
      "20-day direction of 50DMA",
    ),
    f(
      `${symbol}_DRAWDOWN`,
      "ASSET_TREND",
      "RISK",
      draw,
      draw === null
        ? null
        : draw <= C.thresholds.asset.drawdownStrongNegative
          ? -2
          : draw <= C.thresholds.asset.drawdownNegative
            ? -1
            : 0,
      "Drawdown from one-year high",
    ),
  ];
  if (symbol === "ETH") {
    const eth = series(input.observations, "ETH_USD", input.asOf),
      btc = series(input.observations, "BTC_USD", input.asOf);
    const btcDays = new Map(
      btc.map((x) => [x.observedAt.toISOString().slice(0, 10), x.value]),
    );
    const ratios = eth.flatMap((x) => {
      const b = btcDays.get(x.observedAt.toISOString().slice(0, 10));
      return b ? [{ ...x, value: x.value / b }] : [];
    });
    const raw = change(ratios, 30);
    factors.push(
      f(
        "ETH_BTC_30D",
        "ASSET_TREND",
        "CONFIRMING",
        raw,
        raw === null ? null : score(raw, 5, 0.01),
        "ETH/BTC 30-day relative trend",
      ),
    );
  }
  return aggregate(factors, asset, C.minimumFamilies.asset);
}
export function evaluateV3Regimes(input: V3RegimeInput): V3RegimeOutput {
  return {
    macroLiquidity: evaluateV3Macro(input),
    cryptoCreditLiquidity: evaluateV3CryptoCredit(input),
    marketStructure: evaluateV3MarketStructure(input),
    assets: { BTC: assetRegime("BTC", input), ETH: assetRegime("ETH", input) },
    configurationVersion: C.version,
  };
}
