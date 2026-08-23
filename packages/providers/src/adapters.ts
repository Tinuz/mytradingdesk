import { z } from "zod";
import type {
  HistoricalDataProvider,
  PhaseOneIndicator,
  ProviderObservation,
  ProviderRole,
} from "./types";

type Fetch = typeof fetch;

const coinGeckoRangeSchema = z.object({
  prices: z.array(z.tuple([z.number(), z.number().positive()])),
});
export class CoinGeckoProvider implements HistoricalDataProvider {
  readonly name = "coingecko";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["BTC_USD", "ETH_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "near-real-time";
  readonly rateLimit = "provider-plan dependent";
  constructor(
    private readonly apiKey?: string,
    private readonly fetcher: Fetch = fetch,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const now = new Date();
    return this.fetchRange(
      indicator,
      new Date(now.getTime() - 30 * 60_000),
      now,
    );
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    const id =
      indicator === "BTC_USD"
        ? "bitcoin"
        : indicator === "ETH_USD"
          ? "ethereum"
          : undefined;
    if (!id) throw new Error(`coingecko does not support ${indicator}`);
    const request: RequestInit = this.apiKey
      ? { headers: { "x-cg-demo-api-key": this.apiKey } }
      : {};
    const response = await this.fetcher(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${Math.floor(from.getTime() / 1000)}&to=${Math.floor(to.getTime() / 1000)}`,
      request,
    );
    if (!response.ok) throw new Error(`coingecko HTTP ${response.status}`);
    return coinGeckoRangeSchema
      .parse(await response.json())
      .prices.map(([timestamp, value]) => ({
        indicator,
        observedAt: new Date(timestamp),
        value,
        unit: "usd",
        providerReference: `${id}:${timestamp}`,
        payload: { timestamp, value },
      }));
  }
}

const fredSchema = z.object({
  observations: z.array(
    z.object({
      date: z.string(),
      realtime_start: z.string(),
      realtime_end: z.string(),
      value: z.string(),
    }),
  ),
});
export class FredProvider implements HistoricalDataProvider {
  readonly name = "fred";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["US10Y_REAL"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily publication";
  readonly rateLimit = "120 requests/minute";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    return this.fetchRange(
      indicator,
      new Date(to.getTime() - 14 * 86_400_000),
      to,
    );
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "US10Y_REAL")
      throw new Error(`fred does not support ${indicator}`);
    const params = new URLSearchParams({
      series_id: "DFII10",
      api_key: this.apiKey,
      file_type: "json",
      observation_start: from.toISOString().slice(0, 10),
      observation_end: to.toISOString().slice(0, 10),
    });
    const response = await this.fetcher(
      `https://api.stlouisfed.org/fred/series/observations?${params}`,
    );
    if (!response.ok) throw new Error(`fred HTTP ${response.status}`);
    return fredSchema
      .parse(await response.json())
      .observations.filter((row) => row.value !== ".")
      .map((row) => ({
        indicator,
        observedAt: new Date(`${row.date}T00:00:00Z`),
        revisionAt: new Date(`${row.realtime_start}T00:00:00Z`),
        value: Number(row.value),
        unit: "percent",
        providerReference: `DFII10:${row.date}:${row.realtime_start}`,
        payload: row,
      }));
  }
}

export const calculateDxyProxy = (rates: {
  eurUsd: number;
  jpyPerUsd: number;
  gbpUsd: number;
  cadPerUsd: number;
  sekPerUsd: number;
  chfPerUsd: number;
}) => {
  if (
    Object.values(rates).some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error("DXY proxy FX rates must be positive finite numbers");
  }
  return (
    50.14348112 *
    rates.eurUsd ** -0.576 *
    rates.jpyPerUsd ** 0.136 *
    rates.gbpUsd ** -0.119 *
    rates.cadPerUsd ** 0.091 *
    rates.sekPerUsd ** 0.042 *
    rates.chfPerUsd ** 0.036
  );
};

const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (character === '"' && quoted && input[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value);
      value = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += character;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
};

export class EcbDxyProxyProvider implements HistoricalDataProvider {
  readonly name = "ecb-dxy-proxy";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["DXY_PROXY_ECB"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily ECB reference-rate publication";
  readonly rateLimit = "public SDMX endpoint; use one batched request";
  constructor(private readonly fetcher: Fetch = fetch) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    return (
      await this.fetchRange(
        indicator,
        new Date(to.getTime() - 10 * 86_400_000),
        to,
      )
    ).slice(-1);
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "DXY_PROXY_ECB")
      throw new Error(`ecb-dxy-proxy does not support ${indicator}`);
    const params = new URLSearchParams({
      startPeriod: from.toISOString().slice(0, 10),
      endPeriod: to.toISOString().slice(0, 10),
      format: "csvdata",
      detail: "dataonly",
    });
    const response = await this.fetcher(
      `https://data-api.ecb.europa.eu/service/data/EXR/D.USD+JPY+GBP+CAD+SEK+CHF.EUR.SP00.A?${params}`,
    );
    if (!response.ok) throw new Error(`ecb-dxy-proxy HTTP ${response.status}`);
    const rows = parseCsv(await response.text());
    const header =
      rows.shift()?.map((value) => value.trim().replace(/^\uFEFF/, "")) ?? [];
    const dateIndex = header.indexOf("TIME_PERIOD"),
      currencyIndex = header.indexOf("CURRENCY"),
      valueIndex = header.indexOf("OBS_VALUE");
    if ([dateIndex, currencyIndex, valueIndex].some((index) => index < 0))
      throw new Error("ecb-dxy-proxy CSV columns missing");
    const byDate = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const date = row[dateIndex],
        currency = row[currencyIndex],
        raw = row[valueIndex];
      if (!date || !currency || !raw || !Number.isFinite(Number(raw))) continue;
      const values = byDate.get(date) ?? new Map<string, number>();
      values.set(currency, Number(raw));
      byDate.set(date, values);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([date, values]) => {
        const usd = values.get("USD"),
          jpy = values.get("JPY"),
          gbp = values.get("GBP"),
          cad = values.get("CAD"),
          sek = values.get("SEK"),
          chf = values.get("CHF");
        if ([usd, jpy, gbp, cad, sek, chf].some((value) => value === undefined))
          return [];
        const components = {
          eurUsd: usd!,
          jpyPerUsd: jpy! / usd!,
          gbpUsd: usd! / gbp!,
          cadPerUsd: cad! / usd!,
          sekPerUsd: sek! / usd!,
          chfPerUsd: chf! / usd!,
        };
        return [
          {
            indicator,
            observedAt: new Date(`${date}T00:00:00Z`),
            value: calculateDxyProxy(components),
            unit: "index_points",
            providerReference: `ecb-dxy-proxy-v1:${date}`,
            payload: {
              methodologyVersion: "ecb-dxy-proxy-v1",
              formula:
                "50.14348112*EURUSD^-0.576*USDJPY^0.136*GBPUSD^-0.119*USDCAD^0.091*USDSEK^0.042*USDCHF^0.036",
              fixing:
                "ECB daily reference rates; not the official ICE DXY close",
              sourceSeries: "EXR/D.USD+JPY+GBP+CAD+SEK+CHF.EUR.SP00.A",
              components,
            },
          } satisfies ProviderObservation,
        ];
      });
  }
}

export class FredBroadDollarProvider implements HistoricalDataProvider {
  readonly name = "fred-broad-dollar";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["US_BROAD_DOLLAR_INDEX"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily Federal Reserve publication";
  readonly rateLimit = "120 requests/minute";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    return (
      await this.fetchRange(
        indicator,
        new Date(to.getTime() - 14 * 86_400_000),
        to,
      )
    ).slice(-1);
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "US_BROAD_DOLLAR_INDEX")
      throw new Error(`fred-broad-dollar does not support ${indicator}`);
    const params = new URLSearchParams({
      series_id: "DTWEXBGS",
      api_key: this.apiKey,
      file_type: "json",
      observation_start: from.toISOString().slice(0, 10),
      observation_end: to.toISOString().slice(0, 10),
    });
    const response = await this.fetcher(
      `https://api.stlouisfed.org/fred/series/observations?${params}`,
    );
    if (!response.ok) throw new Error(`fred DTWEXBGS HTTP ${response.status}`);
    return fredSchema
      .parse(await response.json())
      .observations.filter((row) => row.value !== ".")
      .map((row) => ({
        indicator,
        observedAt: new Date(`${row.date}T00:00:00Z`),
        revisionAt: new Date(`${row.realtime_start}T00:00:00Z`),
        value: Number(row.value),
        unit: "index_points",
        providerReference: `DTWEXBGS:${row.date}:${row.realtime_start}`,
        payload: {
          ...row,
          series: "DTWEXBGS",
          use: "independent validation only; not an exact DXY substitute",
        },
      }));
  }
}

const twelveSchema = z.object({
  values: z.array(z.object({ datetime: z.string(), close: z.string() })),
});
export class TwelveDataProvider implements HistoricalDataProvider {
  readonly name = "twelve-data";
  readonly role: ProviderRole = "FALLBACK";
  readonly supportedIndicators = ["BTC_USD", "ETH_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "interval dependent";
  readonly rateLimit = "provider-plan dependent";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    return this.request(indicator, undefined, undefined, 1);
  }
  async fetchRange(indicator: PhaseOneIndicator, from: Date, to: Date) {
    return this.request(indicator, from, to, 5000);
  }
  private async request(
    indicator: PhaseOneIndicator,
    from: Date | undefined,
    to: Date | undefined,
    outputsize: number,
  ): Promise<readonly ProviderObservation[]> {
    const symbol = ({ BTC_USD: "BTC/USD", ETH_USD: "ETH/USD" } as const)[
      indicator as "BTC_USD" | "ETH_USD"
    ];
    if (!symbol) throw new Error(`twelve-data does not support ${indicator}`);
    const interval = "15min";
    const params = new URLSearchParams({
      symbol,
      interval,
      outputsize: String(outputsize),
      timezone: "UTC",
      apikey: this.apiKey,
    });
    if (from) params.set("start_date", from.toISOString());
    if (to) params.set("end_date", to.toISOString());
    const response = await this.fetcher(
      `https://api.twelvedata.com/time_series?${params}`,
    );
    if (!response.ok) throw new Error(`twelve-data HTTP ${response.status}`);
    const unit = "usd";
    return twelveSchema
      .parse(await response.json())
      .values.map((row) => ({
        indicator,
        observedAt: new Date(`${row.datetime.replace(" ", "T")}Z`),
        value: Number(row.close),
        unit,
        providerReference: `${symbol}:${interval}:${row.datetime}`,
        payload: row,
      }));
  }
}

const stablecoinChartSchema = z.array(
  z.object({
    date: z.string(),
    totalCirculatingUSD: z.object({ peggedUSD: z.number().nonnegative() }),
  }),
);
export class DefiLlamaStablecoinProvider implements HistoricalDataProvider {
  readonly name = "defillama";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["STABLECOIN_SUPPLY_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily aggregate";
  readonly rateLimit = "public endpoint; undocumented limit";
  constructor(private readonly fetcher: Fetch = fetch) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const values = await this.all(indicator);
    return values.slice(-1);
  }
  async fetchRange(indicator: PhaseOneIndicator, from: Date, to: Date) {
    return (await this.all(indicator)).filter(
      (item) => item.observedAt >= from && item.observedAt <= to,
    );
  }
  private async all(
    indicator: PhaseOneIndicator,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "STABLECOIN_SUPPLY_USD")
      throw new Error(`defillama does not support ${indicator}`);
    const response = await this.fetcher(
      "https://stablecoins.llama.fi/stablecoincharts/all",
    );
    if (!response.ok) throw new Error(`defillama HTTP ${response.status}`);
    return stablecoinChartSchema
      .parse(await response.json())
      .map((row) => ({
        indicator,
        observedAt: new Date(Number(row.date) * 1_000),
        value: row.totalCirculatingUSD.peggedUSD,
        unit: "usd",
        providerReference: `all:${row.date}`,
        payload: row,
      }));
  }
}

const sosoRowSchema = z.object({
  date: z.string(),
  totalNetInflow: z.number(),
});
const sosoSchema = z.object({
  code: z.literal(0),
  data: z.union([
    z.array(sosoRowSchema),
    z.object({ list: z.array(sosoRowSchema) }),
  ]),
});
export class SoSoValueEtfProvider implements HistoricalDataProvider {
  readonly name = "sosovalue";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = [
    "BTC_ETF_NET_FLOW_USD",
    "ETH_ETF_NET_FLOW_USD",
  ] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily after US market data completion";
  readonly rateLimit = "provider-plan dependent; history limited to 300 days";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const values = await this.all(indicator);
    return values.slice(-1);
  }
  async fetchRange(indicator: PhaseOneIndicator, from: Date, to: Date) {
    return (await this.all(indicator)).filter(
      (item) => item.observedAt >= from && item.observedAt <= to,
    );
  }
  private async all(
    indicator: PhaseOneIndicator,
  ): Promise<readonly ProviderObservation[]> {
    const type =
      indicator === "BTC_ETF_NET_FLOW_USD"
        ? "us-btc-spot"
        : indicator === "ETH_ETF_NET_FLOW_USD"
          ? "us-eth-spot"
          : undefined;
    if (!type) throw new Error(`sosovalue does not support ${indicator}`);
    const response = await this.fetcher(
      "https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-soso-api-key": this.apiKey,
        },
        body: JSON.stringify({ type }),
      },
    );
    if (!response.ok) throw new Error(`sosovalue HTTP ${response.status}`);
    const parsed = sosoSchema.parse(await response.json());
    const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.list;
    return rows
      .map((row) => ({
        indicator,
        observedAt: new Date(`${row.date}T00:00:00Z`),
        value: row.totalNetInflow,
        unit: "usd",
        providerReference: `${type}:${row.date}`,
        payload: row,
      }))
      .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  }
}

export class FredLiquidityProvider implements HistoricalDataProvider {
  readonly name = "fred-liquidity";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["US_NET_LIQUIDITY_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "weekly after H.4.1 publication";
  readonly rateLimit = "120 requests/minute across three series";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    const values = await this.fetchRange(
      indicator,
      new Date(to.getTime() - 35 * 86_400_000),
      to,
    );
    return values.slice(-1);
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "US_NET_LIQUIDITY_USD")
      throw new Error(`fred-liquidity does not support ${indicator}`);
    const components = await Promise.all(
      ["WALCL", "WTREGEN", "RRPONTSYD"].map((series) =>
        this.series(series, from, to),
      ),
    );
    const walcl = components[0]!;
    const tga = components[1]!;
    const rrp = components[2]!;
    const tgaByDate = new Map(tga.map((row) => [row.date, row]));
    const rrpByDate = new Map(rrp.map((row) => [row.date, row]));
    return walcl.flatMap((balanceSheet) => {
      const treasury = tgaByDate.get(balanceSheet.date);
      const reverseRepo = rrpByDate.get(balanceSheet.date);
      if (!treasury || !reverseRepo) return [];
      const value =
        balanceSheet.value / 1_000 - treasury.value / 1_000 - reverseRepo.value;
      return [
        {
          indicator,
          observedAt: new Date(`${balanceSheet.date}T00:00:00Z`),
          revisionAt: new Date(`${balanceSheet.realtime_start}T00:00:00Z`),
          value,
          unit: "usd_billions",
          providerReference: `WALCL-WTREGEN-RRPONTSYD:${balanceSheet.date}:${balanceSheet.realtime_start}`,
          payload: {
            formula: "WALCL/1000-WTREGEN/1000-RRPONTSYD",
            WALCL: balanceSheet,
            WTREGEN: treasury,
            RRPONTSYD: reverseRepo,
          },
        } satisfies ProviderObservation,
      ];
    });
  }
  private async series(seriesId: string, from: Date, to: Date) {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: this.apiKey,
      file_type: "json",
      observation_start: from.toISOString().slice(0, 10),
      observation_end: to.toISOString().slice(0, 10),
    });
    const response = await this.fetcher(
      `https://api.stlouisfed.org/fred/series/observations?${params}`,
    );
    if (!response.ok)
      throw new Error(`fred ${seriesId} HTTP ${response.status}`);
    return fredSchema
      .parse(await response.json())
      .observations.filter((row) => row.value !== ".")
      .map((row) => ({ ...row, value: Number(row.value) }));
  }
}

type FredNumericRow = {
  date: string;
  realtime_start: string;
  realtime_end: string;
  value: number;
};

function latestAtOrBefore(
  rows: readonly FredNumericRow[],
  date: string,
): FredNumericRow | undefined {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.date <= date) return row;
  }
  return undefined;
}

export function calculateG3LiquidityUsdBillions(input: {
  walcl: number;
  ecbAssets: number;
  eurUsd: number;
  bojAssets: number;
  jpyPerUsd: number;
}): number {
  if (input.eurUsd <= 0 || input.jpyPerUsd <= 0)
    throw new Error("G3 liquidity FX rates must be positive");
  return (
    input.walcl / 1_000 +
    (input.ecbAssets * input.eurUsd) / 1_000 +
    (input.bojAssets * 0.1) / input.jpyPerUsd
  );
}

export class FredGlobalLiquidityProvider implements HistoricalDataProvider {
  readonly name = "fred-global-liquidity";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["GLOBAL_LIQUIDITY_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency =
    "monthly, anchored to Bank of Japan total-assets observations";
  readonly rateLimit = "120 requests/minute across five series";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    return (
      await this.fetchRange(
        indicator,
        new Date(to.getTime() - 120 * 86_400_000),
        to,
      )
    ).slice(-1);
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "GLOBAL_LIQUIDITY_USD")
      throw new Error(`fred-global-liquidity does not support ${indicator}`);
    const bufferedFrom = new Date(from.getTime() - 62 * 86_400_000);
    const [walcl, ecb, boj, eurUsd, jpyPerUsd] = await Promise.all([
      this.series("WALCL", bufferedFrom, to),
      this.series("ECBASSETSW", bufferedFrom, to),
      this.series("JPNASSETS", bufferedFrom, to),
      this.series("DEXUSEU", bufferedFrom, to),
      this.series("DEXJPUS", bufferedFrom, to),
    ]);
    return boj
      .filter(
        (anchor) =>
          anchor.date >= from.toISOString().slice(0, 10) &&
          anchor.date <= to.toISOString().slice(0, 10),
      )
      .flatMap((anchor) => {
        const fed = latestAtOrBefore(walcl, anchor.date);
        const euro = latestAtOrBefore(ecb, anchor.date);
        const eurRate = latestAtOrBefore(eurUsd, anchor.date);
        const yenRate = latestAtOrBefore(jpyPerUsd, anchor.date);
        if (!fed || !euro || !eurRate || !yenRate) return [];
        const value = calculateG3LiquidityUsdBillions({
          walcl: fed.value,
          ecbAssets: euro.value,
          eurUsd: eurRate.value,
          bojAssets: anchor.value,
          jpyPerUsd: yenRate.value,
        });
        const revision = [fed, euro, anchor, eurRate, yenRate]
          .map((row) => row.realtime_start)
          .sort()
          .at(-1)!;
        return [
          {
            indicator,
            observedAt: new Date(`${anchor.date}T00:00:00Z`),
            revisionAt: new Date(`${revision}T00:00:00Z`),
            value,
            unit: "usd_billions",
            providerReference: `G3-CB-ASSETS:${anchor.date}:${revision}`,
            payload: {
              methodologyVersion: "g3-central-bank-assets-usd-v1",
              formula:
                "WALCL/1000 + ECBASSETSW*DEXUSEU/1000 + JPNASSETS*0.1/DEXJPUS",
              alignment:
                "latest observation at or before JPNASSETS anchor; no interpolation",
              limitations: [
                "excludes China/PBoC",
                "central-bank-assets proxy, not global M2",
              ],
              WALCL: fed,
              ECBASSETSW: euro,
              JPNASSETS: anchor,
              DEXUSEU: eurRate,
              DEXJPUS: yenRate,
            },
          } satisfies ProviderObservation,
        ];
      });
  }
  private async series(
    seriesId: string,
    from: Date,
    to: Date,
  ): Promise<FredNumericRow[]> {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: this.apiKey,
      file_type: "json",
      observation_start: from.toISOString().slice(0, 10),
      observation_end: to.toISOString().slice(0, 10),
    });
    const response = await this.fetcher(
      `https://api.stlouisfed.org/fred/series/observations?${params}`,
    );
    if (!response.ok)
      throw new Error(`fred ${seriesId} HTTP ${response.status}`);
    return fredSchema
      .parse(await response.json())
      .observations.filter((row) => row.value !== ".")
      .map((row) => ({ ...row, value: Number(row.value) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

export const DEFI_LOANS_UNIVERSE_V1 = [
  "aave-v3",
  "morpho-blue",
  "sparklend",
  "maple",
  "kamino-lend",
  "jupiter-lend",
  "fluid-lending",
  "euler-v2",
  "compound-v3",
  "venus-core-pool",
] as const;

const borrowedHistorySchema = z.object({
  chainTvls: z.object({
    borrowed: z.object({
      tvl: z.array(
        z.object({
          date: z.number().int().positive(),
          totalLiquidityUSD: z.number().nonnegative(),
        }),
      ),
    }),
  }),
});

export class DefiLlamaLoansProvider implements HistoricalDataProvider {
  readonly name = "defillama-loans";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["DEFI_ACTIVE_LOANS_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily aggregate from a fixed protocol universe";
  readonly rateLimit =
    "public endpoint; undocumented limit; ten protocol requests per run";
  constructor(
    private readonly fetcher: Fetch = fetch,
    private readonly universe: readonly string[] = DEFI_LOANS_UNIVERSE_V1,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    return (
      await this.fetchRange(
        indicator,
        new Date(to.getTime() - 7 * 86_400_000),
        to,
      )
    ).slice(-1);
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "DEFI_ACTIVE_LOANS_USD")
      throw new Error(`defillama-loans does not support ${indicator}`);
    const histories = await Promise.all(
      this.universe.map(async (slug) => {
        const response = await this.fetcher(
          `https://api.llama.fi/protocol/${slug}`,
        );
        if (!response.ok)
          throw new Error(`defillama ${slug} HTTP ${response.status}`);
        return {
          slug,
          rows: borrowedHistorySchema.parse(await response.json()).chainTvls
            .borrowed.tvl,
        };
      }),
    );
    const byProtocol = histories.map((history) => {
      const daily = new Map<string, number>();
      for (const row of history.rows)
        daily.set(
          new Date(row.date * 1_000).toISOString().slice(0, 10),
          row.totalLiquidityUSD,
        );
      return {
        slug: history.slug,
        daily,
        entries: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)),
      };
    });
    const days = new Set<string>();
    for (const protocol of byProtocol)
      for (const day of protocol.daily.keys())
        if (
          day >= from.toISOString().slice(0, 10) &&
          day <= to.toISOString().slice(0, 10)
        )
          days.add(day);
    return [...days].sort().map((day) => {
      const components = Object.fromEntries(
        byProtocol.map((protocol) => {
          let latest: number | undefined;
          for (const [date, amount] of protocol.entries) {
            if (date > day) break;
            latest = amount;
          }
          return [protocol.slug, latest ?? 0];
        }),
      );
      const value = Object.values(components).reduce(
        (sum, item) => sum + item,
        0,
      );
      return {
        indicator,
        observedAt: new Date(`${day}T00:00:00Z`),
        value,
        unit: "usd",
        providerReference: `defillama-loans-v1:${day}`,
        payload: {
          methodologyVersion: "defillama-fixed-universe-v1",
          universe: this.universe,
          missingProtocolValues: Object.entries(components)
            .filter(([, amount]) => amount === 0)
            .map(([slug]) => slug),
          components,
        },
      } satisfies ProviderObservation;
    });
  }
}

const bgeometricsSchema = z.array(
  z.object({
    d: z.string(),
    unixTs: z.number().int().positive(),
    mvrv: z.number().optional(),
    realizedLoss: z.number().optional(),
    marketCap: z.number().optional(),
  }),
);
export class BGeometricsProvider implements HistoricalDataProvider {
  readonly name = "bgeometrics";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = [
    "BTC_MVRV",
    "BTC_REALIZED_LOSSES_USD",
    "BTC_MARKET_CAP_USD",
  ] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily";
  readonly rateLimit = "free: 8 requests/hour, 15/day, four years history";
  constructor(private readonly fetcher: Fetch = fetch) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    return this.fetchRange(
      indicator,
      new Date(to.getTime() - 7 * 86_400_000),
      to,
    );
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    const endpoint =
      indicator === "BTC_MVRV"
        ? "mvrv"
        : indicator === "BTC_REALIZED_LOSSES_USD"
          ? "realized-loss"
          : indicator === "BTC_MARKET_CAP_USD"
            ? "market-cap"
            : undefined;
    if (!endpoint) throw new Error(`bgeometrics does not support ${indicator}`);
    const params = new URLSearchParams({
      startday: from.toISOString().slice(0, 10),
      endday: to.toISOString().slice(0, 10),
    });
    const response = await this.fetcher(
      `https://bitcoin-data.com/v1/${endpoint}?${params}`,
    );
    if (!response.ok)
      throw new Error(`bgeometrics ${endpoint} HTTP ${response.status}`);
    return bgeometricsSchema.parse(await response.json()).map((row) => {
      const providerValue =
        indicator === "BTC_MVRV"
          ? row.mvrv
          : indicator === "BTC_REALIZED_LOSSES_USD"
            ? row.realizedLoss
            : row.marketCap;
      if (providerValue === undefined)
        throw new Error(`bgeometrics ${endpoint} value missing`);
      const value =
        indicator === "BTC_REALIZED_LOSSES_USD"
          ? Math.abs(providerValue)
          : providerValue;
      return {
        indicator,
        observedAt: new Date(row.unixTs * 1_000),
        value,
        unit: indicator === "BTC_MVRV" ? "ratio" : "usd",
        providerReference: `${endpoint}:${row.d}`,
        payload: {
          ...row,
          normalization:
            indicator === "BTC_REALIZED_LOSSES_USD"
              ? "absolute magnitude of provider-negative realizedLoss"
              : "none",
        },
      };
    });
  }
}

export const BTC_PERPETUAL_OI_UNIVERSE_V1 = [
  "BTC.H",
  "BTC-PERPETUAL.2",
  "BTC-USD.8",
  "BTCUSD_PERP.0",
  "BTCUSDT.6",
  "BTCUSDT_PERP.3",
  "BTCUSDT_PERP.4",
  "BTCUSDT_PERP.A",
  "BTCUSDT_PERP.F",
  "pf_xbtusd.K",
] as const;
const coinalyzeHistorySchema = z.array(
  z.object({
    symbol: z.string(),
    history: z.array(
      z.object({
        t: z.number().int().positive(),
        o: z.number(),
        h: z.number(),
        l: z.number(),
        c: z.number().nonnegative(),
      }),
    ),
  }),
);
export class CoinalyzeOpenInterestProvider implements HistoricalDataProvider {
  readonly name = "coinalyze";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["BTC_PERPETUAL_OI_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily close";
  readonly rateLimit = "free: 40 symbol calls/minute";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
    private readonly universe: readonly string[] = BTC_PERPETUAL_OI_UNIVERSE_V1,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    return (
      await this.fetchRange(
        indicator,
        new Date(to.getTime() - 7 * 86_400_000),
        to,
      )
    ).slice(-1);
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "BTC_PERPETUAL_OI_USD")
      throw new Error(`coinalyze does not support ${indicator}`);
    const params = new URLSearchParams({
      symbols: this.universe.join(","),
      interval: "daily",
      from: String(Math.floor(from.getTime() / 1_000)),
      to: String(Math.floor(to.getTime() / 1_000)),
      convert_to_usd: "true",
    });
    const response = await this.fetcher(
      `https://api.coinalyze.net/v1/open-interest-history?${params}`,
      { headers: { api_key: this.apiKey } },
    );
    if (!response.ok) throw new Error(`coinalyze HTTP ${response.status}`);
    const series = coinalyzeHistorySchema.parse(await response.json());
    const bySymbol = new Map(
      series.map((item) => [
        item.symbol,
        new Map(
          item.history.map((row) => [
            new Date(row.t * 1_000).toISOString().slice(0, 10),
            row.c,
          ]),
        ),
      ]),
    );
    const days = new Set(
      series.flatMap((item) =>
        item.history.map((row) =>
          new Date(row.t * 1_000).toISOString().slice(0, 10),
        ),
      ),
    );
    return [...days].sort().flatMap((day) => {
      const components = Object.fromEntries(
        this.universe.map((symbol) => [symbol, bySymbol.get(symbol)?.get(day)]),
      );
      if (Object.values(components).some((value) => value === undefined))
        return [];
      const value = Object.values(components).reduce<number>(
        (sum, item) => sum + (item ?? 0),
        0,
      );
      return [
        {
          indicator,
          observedAt: new Date(`${day}T00:00:00Z`),
          value,
          unit: "usd",
          providerReference: `coinalyze-btc-perp-v1:${day}`,
          payload: {
            methodologyVersion: "coinalyze-btc-perp-fixed-universe-v1",
            convertToUsd: true,
            universe: this.universe,
            components,
          },
        } satisfies ProviderObservation,
      ];
    });
  }
}

const coinGeckoMarketCapSchema = z.object({
  market_caps: z.array(z.tuple([z.number(), z.number().positive()])),
});
export class CoinGeckoMarketCapProvider implements HistoricalDataProvider {
  readonly name = "coingecko-market-cap";
  readonly role: ProviderRole = "CANONICAL";
  readonly supportedIndicators = ["BTC_MARKET_CAP_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "daily reference";
  readonly rateLimit = "provider-plan dependent";
  constructor(
    private readonly apiKey?: string,
    private readonly fetcher: Fetch = fetch,
  ) {}
  async fetchLatest(indicator: PhaseOneIndicator) {
    const to = new Date();
    return (
      await this.fetchRange(
        indicator,
        new Date(to.getTime() - 2 * 86_400_000),
        to,
      )
    ).slice(-1);
  }
  async fetchRange(
    indicator: PhaseOneIndicator,
    from: Date,
    to: Date,
  ): Promise<readonly ProviderObservation[]> {
    if (indicator !== "BTC_MARKET_CAP_USD")
      throw new Error(`coingecko-market-cap does not support ${indicator}`);
    const request: RequestInit = this.apiKey
      ? { headers: { "x-cg-demo-api-key": this.apiKey } }
      : {};
    const response = await this.fetcher(
      `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${Math.floor(from.getTime() / 1000)}&to=${Math.floor(to.getTime() / 1000)}`,
      request,
    );
    if (!response.ok)
      throw new Error(`coingecko market cap HTTP ${response.status}`);
    return coinGeckoMarketCapSchema
      .parse(await response.json())
      .market_caps.map(([timestamp, value]) => ({
        indicator,
        observedAt: new Date(timestamp),
        value,
        unit: "usd",
        providerReference: `bitcoin-market-cap:${timestamp}`,
        payload: { timestamp, value },
      }));
  }
}
