# Data sources

All semantic thresholds below are `HYPOTHESIS` values pending historical validation. Provider credentials are server-only. A provider failure produces an explicit quality event; it never causes a silent source switch.

## BTC/USD and ETH/USD

| Property            | Value                                                            |
| ------------------- | ---------------------------------------------------------------- |
| Canonical provider  | CoinGecko                                                        |
| Endpoint            | `GET /api/v3/coins/{id}/market_chart/range`                      |
| Unit                | USD per asset                                                    |
| Requested cadence   | 15 minutes                                                       |
| Backfill            | Yes; plan-dependent history and granularity                      |
| Freshness           | Stale after 30 minutes                                           |
| Semantic range      | BTC 100–2,000,000; ETH 1–200,000 USD (`HYPOTHESIS`)              |
| Maximum change      | BTC 35%; ETH 40% between observations (`HYPOTHESIS`)             |
| Fallback/validation | Twelve Data `BTC/USD` and `ETH/USD`; 1% tolerance (`HYPOTHESIS`) |

CoinGecko documents timestamp/price pairs and automatic granularity: recent one-day ranges may be five-minute, 2–90-day ranges hourly, and ranges over 90 days daily. Basic-plan history is limited, so long backfills must be chunked and entitlement-aware: <https://docs.coingecko.com/reference/coins-id-market-chart-range>.

Limitations: a CoinGecko price is an aggregated market reference, not an executable venue quote. Exact 15-minute boundaries cannot be assumed; canonical timestamps are preserved as delivered.

## DXY

| Property           | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| Canonical provider | ICE Data API, not yet licensed/configured                       |
| Endpoint           | To be configured after ICE entitlement                          |
| Unit               | Index points                                                    |
| Requested cadence  | Hourly                                                          |
| Backfill           | ICE advertises historical delivery; entitlement details pending |
| Freshness          | Stale after four hours                                          |
| Semantic range     | 50–200 index points (`HYPOTHESIS`)                              |
| Maximum change     | 10% between hourly observations (`HYPOTHESIS`)                  |
| Fallback           | None approved                                                   |

Live Twelve Data discovery returned only unrelated securities (`DXYN` and `DXYZ`) and its `DXY` time-series request returned HTTP 404. Twelve Data is therefore not an approved DXY provider. ICE identifies DXY/NYICDX as the ICE U.S. Dollar Index and offers it through licensed ICE delivery products: <https://developer.ice.com/fixed-income-data-services/catalog/ice-data-indices-currency-indices>.

Important: a Federal Reserve trade-weighted dollar series is not DXY and will not be substituted. Until licensed ICE access or another exact, approved DXY source is configured, DXY remains `SOURCE FAILURE`/`UNKNOWN`.

Product decision 2026-08-22: exact DXY/NYICDX ingestion is deferred to [backlog.md](backlog.md). Phase 2 may proceed, but no later model may treat this missing factor as neutral or silently replace it.

## US 10-year real yield

| Property           | Value                               |
| ------------------ | ----------------------------------- |
| Canonical provider | FRED                                |
| Series             | `DFII10`                            |
| Endpoint           | `GET /fred/series/observations`     |
| Unit               | Percent                             |
| Frequency          | Daily on publication days           |
| Backfill           | Yes                                 |
| Freshness          | Stale after four calendar days      |
| Semantic range     | -10% to 20% (`HYPOTHESIS`)          |
| Maximum change     | 100% relative change (`HYPOTHESIS`) |
| Fallback           | None approved                       |

FRED identifies DFII10 as the daily, percent, inflation-indexed 10-year constant-maturity Treasury yield: <https://fred.stlouisfed.org/series/DFII10>. Its observations API supports observation ranges and real-time/vintage parameters: <https://fred.stlouisfed.org/docs/api/fred/series_observations.html>.

Limitations: `realtime_start` is stored as revision/vintage timing, not falsely labeled as publication time. Live receipt time is always persisted. A later historical replay implementation must query vintages explicitly to prevent look-ahead bias.

## Total stablecoin supply

| Property              | Value                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| Canonical provider    | DefiLlama Stablecoins API                                             |
| Endpoint              | `GET https://stablecoins.llama.fi/stablecoincharts/all`               |
| Unit                  | USD circulating market capitalization of USD-pegged assets            |
| Source frequency      | Daily; requested every four hours only to detect publication promptly |
| Backfill              | Full daily history returned by the endpoint                           |
| Freshness             | Stale after 36 hours                                                  |
| Semantic range/change | $1B–$10T and max 10% daily (`HYPOTHESIS`)                             |
| Fallback              | None approved                                                         |

DefiLlama documents `/stablecoincharts/all` as the historical aggregate market-cap endpoint: <https://github.com/DefiLlama/api-docs/blob/main/llms-pro.txt>. This measures increased on-chain dollar liquidity; it is not independently classified as bullish.

## US spot BTC and ETH ETF flows

| Property           | Value                                        |
| ------------------ | -------------------------------------------- |
| Canonical provider | SoSoValue API v2                             |
| Endpoint           | `POST /openapi/v2/etf/historicalInflowChart` |
| Request types      | `us-btc-spot`, `us-eth-spot`                 |
| Unit               | Daily aggregate net flow in USD              |
| Backfill           | Most recent 300 days                         |
| Freshness          | Stale after 72 hours to tolerate weekends    |
| Semantic range     | -$10B to +$10B daily (`HYPOTHESIS`)          |
| Fallback           | None approved                                |

The official endpoint documents daily aggregate net inflow and its 300-day limit: <https://sosovalue.gitbook.io/soso-value-api-doc/api-document/get-etf-historical-inflow-chart>. Activation requires `SOSOVALUE_API_KEY`. Individual days are raw evidence only; later intelligence uses 5-day and 20-day rolling flows.

## US net-liquidity proxy

| Property              | Value                                    |
| --------------------- | ---------------------------------------- |
| Canonical provider    | FRED composite                           |
| Components            | `WALCL`, `WTREGEN`, `RRPONTSYD`          |
| Formula               | `WALCL/1000 − WTREGEN/1000 − RRPONTSYD`  |
| Unit                  | USD billions                             |
| Frequency             | Weekly on dates shared by all components |
| Backfill              | Yes                                      |
| Freshness             | Stale after 10 days                      |
| Semantic range/change | -$5T–$20T and max 20% (`HYPOTHESIS`)     |

`WALCL` is reported weekly in millions of USD by the Federal Reserve: <https://fred.stlouisfed.org/series/WALCL>. The formula and component choice are explicitly an unvalidated model hypothesis, not an official Federal Reserve statistic. Raw component payloads and the exact formula are persisted with every observation.

## G3 central-bank assets liquidity proxy

| Property              | Value                                                          |
| --------------------- | -------------------------------------------------------------- |
| Canonical provider    | FRED composite                                                 |
| Components            | `WALCL`, `ECBASSETSW`, `JPNASSETS`, `DEXUSEU`, `DEXJPUS`       |
| Formula               | `WALCL/1000 + ECBASSETSW*DEXUSEU/1000 + JPNASSETS*0.1/DEXJPUS` |
| Unit                  | USD billions                                                   |
| Frequency             | Monthly, anchored to `JPNASSETS`                               |
| Backfill              | Yes; current script requests ten years                         |
| Freshness             | Stale after 62 days                                            |
| Semantic range/change | $1T–$100T and max 15% monthly (`HYPOTHESIS`)                   |
| Authentication        | Existing `FRED_API_KEY`; no new paid key                       |

For each BoJ anchor, the adapter selects the most recent component value dated on or before the anchor. It never interpolates and never selects a future value. Every canonical candidate contains the exact five source rows, formula, alignment rule and `g3-central-bank-assets-usd-v1` methodology version.

This is deliberately named a G3 central-bank-assets proxy. It excludes China/PBoC and does not measure global broad money. Those limitations prevent it from being presented as global M2 or a validated causal signal.

## Active DeFi loans

| Property           | Value                                      |
| ------------------ | ------------------------------------------ |
| Canonical provider | DefiLlama public protocol API              |
| Endpoint           | `GET https://api.llama.fi/protocol/{slug}` |
| Unit               | Outstanding borrowed USD                   |
| Frequency          | Daily                                      |
| Backfill           | Yes                                        |
| Freshness          | Stale after 48 hours                       |
| Authentication     | No API key                                 |
| Methodology        | `defillama-fixed-universe-v1`              |

V1 sums only the top-level `chainTvls.borrowed.tvl` history of a fixed ten-protocol universe. It never adds chain-level borrowed series to the top-level total, which would double-count the same debt. The complete component breakdown and universe version are retained in every raw payload.

The fixed universe makes historical calculations reproducible but does not equal all DeFi lending. Protocol membership may only change under a new methodology and engine version. Thirty-day growth is derived from canonical observations and stores both input observation IDs.

## Bitcoin market structure

MVRV, realized losses and the market-cap denominator use the keyless BGeometrics free API. Free history is limited to four years and the operational budget is 8 requests per hour and 15 per day. Provider-negative `realizedLoss` values are retained raw and normalized to a positive loss magnitude for canonical calculations. CoinGecko market cap remains an implemented fallback/validation adapter.

BTC perpetual OI uses Coinalyze with `COINALYZE_API_KEY`, daily history and `convert_to_usd=true`. Methodology `coinalyze-btc-perp-fixed-universe-v1` aggregates ten explicitly versioned perpetual contracts across Binance, Bybit, OKX, Deribit, BitMEX, Kraken, Hyperliquid, dYdX, Huobi and Bitfinex. A daily aggregate is emitted only when all ten components are present.

`BTC_OI_MARKET_CAP_RATIO` joins OI and market cap on the same UTC date. `BTC_OI_DRAWDOWN_FROM_HIGH_PERCENT` uses the running high in the stored OI history. Both derived observations retain their canonical input IDs.
