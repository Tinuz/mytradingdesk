import { describe, expect, it } from "vitest";
import { BGeometricsProvider, calculateG3LiquidityUsdBillions, CoinalyzeOpenInterestProvider, CoinGeckoMarketCapProvider, CoinGeckoProvider, DefiLlamaLoansProvider, DefiLlamaStablecoinProvider, FredGlobalLiquidityProvider, FredLiquidityProvider, FredProvider, SoSoValueEtfProvider, TwelveDataProvider } from "./adapters";

const jsonResponse = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("provider adapters", () => {
  it("normalizes CoinGecko history without discarding its timestamp", async () => {
    const fetcher: typeof fetch = async () => jsonResponse({ prices: [[1_777_000_000_000, 100_000]] });
    const values = await new CoinGeckoProvider(undefined, fetcher).fetchRange("BTC_USD", new Date("2026-01-01"), new Date("2026-01-02"));
    expect(values[0]).toMatchObject({ indicator: "BTC_USD", value: 100_000, unit: "usd" });
    expect(values[0]?.observedAt.getTime()).toBe(1_777_000_000_000);
  });

  it("normalizes FRED DFII10 and skips missing-dot observations", async () => {
    const fetcher: typeof fetch = async () => jsonResponse({ observations: [
      { date: "2026-08-20", realtime_start: "2026-08-21", realtime_end: "9999-12-31", value: "2.35" },
      { date: "2026-08-21", realtime_start: "2026-08-22", realtime_end: "9999-12-31", value: "." }
    ] });
    const values = await new FredProvider("a".repeat(32), fetcher).fetchRange("US10Y_REAL", new Date("2026-08-20"), new Date("2026-08-21"));
    expect(values).toHaveLength(1); expect(values[0]).toMatchObject({ value: 2.35, unit: "percent" }); expect(values[0]?.publishedAt).toBeUndefined();
  });

  it("requests Twelve Data in UTC and normalizes fallback crypto close", async () => {
    let requested = ""; const fetcher: typeof fetch = async (input) => { requested = String(input); return jsonResponse({ values: [{ datetime: "2026-08-22 10:00:00", close: "98.42" }] }); };
    const values = await new TwelveDataProvider("secret", fetcher).fetchLatest("BTC_USD");
    expect(requested).toContain("timezone=UTC"); expect(values[0]).toMatchObject({ value: 98.42, unit: "usd" });
  });

  it("fails closed on malformed provider payloads", async () => {
    const fetcher: typeof fetch = async () => jsonResponse({ error: "rate limited" });
    await expect(new CoinGeckoProvider(undefined, fetcher).fetchLatest("ETH_USD")).rejects.toThrow();
  });

  it("normalizes total USD-pegged stablecoin supply", async () => {
    const fetcher: typeof fetch = async () => jsonResponse([{ date: "1787356800", totalCirculatingUSD: { peggedUSD: 300_000_000_000 } }]);
    const values = await new DefiLlamaStablecoinProvider(fetcher).fetchLatest("STABLECOIN_SUPPLY_USD");
    expect(values[0]).toMatchObject({ value: 300_000_000_000, unit: "usd" });
  });

  it.each([
    ["BTC_ETF_NET_FLOW_USD", "us-btc-spot"], ["ETH_ETF_NET_FLOW_USD", "us-eth-spot"]
  ] as const)("normalizes %s ETF flows", async (indicator, requestType) => {
    let body = ""; const fetcher: typeof fetch = async (_input, init) => { body = String(init?.body); return jsonResponse({ code: 0, data: [{ date: "2026-08-20", totalNetInflow: -50_000_000 }] }); };
    const values = await new SoSoValueEtfProvider("secret", fetcher).fetchLatest(indicator);
    expect(body).toContain(requestType); expect(values[0]).toMatchObject({ value: -50_000_000, unit: "usd" });
  });

  it("derives the versioned US liquidity proxy from same-date FRED components", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input); const value = url.includes("WALCL") ? "7000000" : url.includes("WTREGEN") ? "500000" : "100";
      return jsonResponse({ observations: [{ date: "2026-08-19", realtime_start: "2026-08-20", realtime_end: "9999-12-31", value }] });
    };
    const values = await new FredLiquidityProvider("a".repeat(32), fetcher).fetchRange("US_NET_LIQUIDITY_USD", new Date("2026-08-19"), new Date("2026-08-20"));
    expect(values[0]).toMatchObject({ value: 6_400, unit: "usd_billions" });
    expect(values[0]?.payload).toMatchObject({ formula: "WALCL/1000-WTREGEN/1000-RRPONTSYD" });
  });

  it("derives a reconstructable monthly G3 liquidity proxy without interpolation", async () => {
    const rows: Record<string, Array<{date:string;realtime_start:string;realtime_end:string;value:string}>> = {
      WALCL: [{ date:"2026-07-29", realtime_start:"2026-08-01", realtime_end:"9999-12-31", value:"7000000" }],
      ECBASSETSW: [{ date:"2026-07-31", realtime_start:"2026-08-01", realtime_end:"9999-12-31", value:"6000000" }],
      JPNASSETS: [{ date:"2026-08-01", realtime_start:"2026-08-02", realtime_end:"9999-12-31", value:"7000000" }],
      DEXUSEU: [{ date:"2026-07-31", realtime_start:"2026-08-01", realtime_end:"9999-12-31", value:"1.2" }],
      DEXJPUS: [{ date:"2026-07-31", realtime_start:"2026-08-01", realtime_end:"9999-12-31", value:"140" }]
    };
    const fetcher: typeof fetch = async input => {
      const series = new URL(String(input)).searchParams.get("series_id")!;
      return jsonResponse({ observations: rows[series] });
    };
    const values = await new FredGlobalLiquidityProvider("a".repeat(32), fetcher).fetchRange("GLOBAL_LIQUIDITY_USD", new Date("2026-08-01"), new Date("2026-08-02"));
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ value: 19_200, unit:"usd_billions" });
    expect(values[0]?.payload).toMatchObject({ methodologyVersion:"g3-central-bank-assets-usd-v1", alignment:"latest observation at or before JPNASSETS anchor; no interpolation" });
  });

  it("rejects invalid FX rates in the G3 formula", () => {
    expect(() => calculateG3LiquidityUsdBillions({ walcl:1, ecbAssets:1, eurUsd:0, bojAssets:1, jpyPerUsd:140 })).toThrow("FX rates must be positive");
  });

  it("aggregates only top-level borrowed histories from a fixed DeFi universe", async () => {
    const fetcher:typeof fetch = async input => {
      const first=String(input).endsWith("/aave-v3");
      return jsonResponse({ chainTvls:{ borrowed:{ tvl:first
        ? [{date:1_777_593_600,totalLiquidityUSD:100},{date:1_777_766_400,totalLiquidityUSD:110}]
        : [{date:1_777_593_600,totalLiquidityUSD:50}] } } });
    };
    const values=await new DefiLlamaLoansProvider(fetcher,["aave-v3","morpho-blue"]).fetchRange("DEFI_ACTIVE_LOANS_USD",new Date("2026-05-01"),new Date("2026-05-03"));
    expect(values.map(item=>item.value)).toEqual([150,160]);
    expect(values[1]?.payload).toMatchObject({methodologyVersion:"defillama-fixed-universe-v1",components:{"aave-v3":110,"morpho-blue":50}});
  });
  it("normalizes provider-negative realized losses to a positive magnitude",async()=>{const fetcher:typeof fetch=async()=>jsonResponse([{d:"2026-08-21",unixTs:1787270400,realizedLoss:-42}]);const values=await new BGeometricsProvider(fetcher).fetchLatest("BTC_REALIZED_LOSSES_USD");expect(values[0]).toMatchObject({value:42,unit:"usd",payload:{realizedLoss:-42}});});
  it("requires complete fixed-universe OI and aggregates USD closes",async()=>{const fetcher:typeof fetch=async()=>jsonResponse([{symbol:"A",history:[{t:1787270400,o:1,h:1,l:1,c:10}]},{symbol:"B",history:[{t:1787270400,o:1,h:1,l:1,c:20}]}]);const values=await new CoinalyzeOpenInterestProvider("secret",fetcher,["A","B"]).fetchLatest("BTC_PERPETUAL_OI_USD");expect(values[0]).toMatchObject({value:30,unit:"usd",payload:{convertToUsd:true}});});
  it("retains CoinGecko market-cap timestamps",async()=>{const fetcher:typeof fetch=async()=>jsonResponse({market_caps:[[1787270400000,2_000_000_000_000]]});const values=await new CoinGeckoMarketCapProvider(undefined,fetcher).fetchLatest("BTC_MARKET_CAP_USD");expect(values[0]).toMatchObject({value:2_000_000_000_000,unit:"usd"});});
});
