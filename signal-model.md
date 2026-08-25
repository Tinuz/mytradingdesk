# Signal model

## V3 migration status

Regime Engine `0.5.1-hypothesis.1`, Decision Engine `0.6.2-hypothesis.1` and Alert Engine `0.7.0-hypothesis.1` are active. Alerts evaluate only new live snapshots after their activation watermark; historical replay cannot emit notifications. The v2 engine remains available for deterministic replay only. New v3 classifications are `LEADING`, `CONFIRMING`, `RISK` and `CONTEXT`, each with status `HYPOTHESIS` or `VALIDATED`.

### V3 regime semantics

- Macro Liquidity and Crypto Credit use `STRONGLY_CONTRACTING` through `STRONGLY_EXPANDING`.
- BTC and ETH use `STRONGLY_NEGATIVE` through `STRONGLY_POSITIVE`.
- Market Structure is a risk/stress axis: `CAPITULATION`, `STRESSED`, `HEALTHY`, `ELEVATED_RISK`, `OVERHEATED`.
- Market Structure scores must never be added as ordinary opportunity points. Negative values describe forced-selling stress; positive values describe leverage/valuation overheating.
- Missing or stale latest observations are excluded and surfaced as warnings. Historical points remain usable when the latest point is fresh.

Current thresholds are explicit hypotheses. Independent factor families are aggregated before regimes, preventing several correlated indicators from dominating by count. Market Structure uses directional risk-family agreement so neutral capitulation data does not conceal independently confirmed overvaluation and leverage risk.

### V3 Decision Engine

Decision engine `0.6.2-hypothesis.1` evaluates all `5 × 5 × 5 × 5 = 625` combinations of Macro Liquidity, Crypto Credit, Market Structure and Asset Regime. Opportunity is calculated from macro, crypto credit and the asset; Market Structure is applied separately as risk/stress governance. Both the pre-governance opportunity state and the independent stress state are persisted. They must never be recombined in the experience layer:

- `ELEVATED_RISK` and `OVERHEATED` cap `STRONG_ACCUMULATION` at `ACCUMULATION`.
- `STRESSED` caps otherwise positive accumulation states at `NEUTRAL`.
- `CAPITULATION` also caps positive accumulation at `NEUTRAL`; capitulation is never treated as a direct buy signal.
- Negative opportunity outcomes are not improved by a Market Structure override.

Transitions use two confirming observations after hysteresis permits the candidate. Initial state establishment is immediate. Confidence describes completeness, freshness, warnings and independent regime coverage; it is not a probability of future return. Every persisted decision retains all four source snapshots, the override, transition memory, engine version and structured explanation facts.

### G3 central-bank assets liquidity proxy

`GLOBAL_LIQUIDITY_USD` is a free, reproducible first implementation of global liquidity. It is a monthly USD-denominated G3 central-bank-assets proxy, not global M2:

```text
WALCL / 1,000
+ ECBASSETSW * DEXUSEU / 1,000
+ JPNASSETS * 0.1 / DEXJPUS
```

Inputs and units:

| FRED series  | Meaning                      | Source unit      | Transformation                       |
| ------------ | ---------------------------- | ---------------- | ------------------------------------ |
| `WALCL`      | Federal Reserve total assets | USD millions     | divide by 1,000                      |
| `ECBASSETSW` | Eurosystem total assets      | EUR millions     | multiply by USD/EUR, divide by 1,000 |
| `JPNASSETS`  | Bank of Japan total assets   | JPY 100 millions | multiply by 0.1, divide by JPY/USD   |
| `DEXUSEU`    | USD per EUR                  | FX rate          | converts ECB assets to USD           |
| `DEXJPUS`    | JPY per USD                  | FX rate          | converts BoJ assets to USD           |

The output is anchored to each `JPNASSETS` observation. For every component the latest observation at or before that anchor is used; values are never interpolated or taken from the future. The raw component rows, formula, alignment rule and methodology version are embedded in every provider payload, allowing exact reconstruction.

Known limitations: China/PBoC is excluded and central-bank assets are not equivalent to broad money. Consequently the factor is classified as a `LEADING` `HYPOTHESIS`. The contract uses a monthly expected frequency, a 62-day freshness boundary, a USD 1–100 trillion plausible range and a 15% maximum month-to-month change.

## Legacy v2 model

Phase 4 decisions are active under configuration `0.4.0-hypothesis.1`; the underlying regime configuration remains `0.3.0-hypothesis.1`. All thresholds, transition rules and classifications remain `HYPOTHESIS`. There is no alerting or allocation advice.

## Fixed vocabulary

- Scores: `-2`, `-1`, `0`, `+1`, `+2`
- Macro: strongly restrictive through strongly supportive
- Crypto liquidity: strongly contracting through strongly expanding
- Asset: strongly negative through strongly positive
- Confidence: `LOW`, `MEDIUM`, `HIGH`
- Decisions: `STRONG_ACCUMULATION`, `ACCUMULATION`, `NEUTRAL`, `RISK_REDUCTION`, `DEFENSIVE`

## Decision matrix

The complete 125-combination matrix is generated and exported from versioned configuration. These initial rules reproduce the specification examples:

- `STRONG_ACCUMULATION`: macro and crypto are both `+2`, asset is at least `+1`.
- `DEFENSIVE`: macro is `-2`, crypto and asset are both at most `-1`.
- `ACCUMULATION`: combined score is at least `+2`, with neither macro nor crypto negative.
- `RISK_REDUCTION`: combined score is at most `-2`, with neither macro nor crypto positive.
- All contradictory or unmatched combinations are `NEUTRAL`.

## Hysteresis and persistence

Transitions use different entry and exit evidence. Accumulation requires a combined score of at least `+2`; it is retained through a weak-neutral boundary and exits at `0` or below. Strong accumulation enters at `+5` and exits at `+3` or below. The negative boundaries mirror this at `-2/-5` and `0/-3`. A permitted transition requires two consecutive equal candidates. Initial state establishment is immediate.

Four explicit deterministic shock codes may bypass persistence and immediately produce `DEFENSIVE`: systemic stablecoin failure, major exchange insolvency, government prohibition and emergency central-bank action. Free text and LLM output cannot trigger this override.

## Confidence and explanations

Confidence reflects regime availability, factor coverage, warnings, independent regime-direction agreement and supplied data-quality issues. `HIGH` requires complete, warning-free and directionally aligned inputs. Missing critical data or critical quality issues yields `LOW`; other usable but incomplete or contradictory conditions yield `MEDIUM`. The engine returns structured positive drivers, negative drivers, contradictions and data warnings without generating prose or advice.

## Macro regime

| Factor                                    | Family              | Timing hypothesis | Normalization hypothesis                  |
| ----------------------------------------- | ------------------- | ----------------- | ----------------------------------------- |
| ECB-derived dollar strength 90-day change | Monetary conditions | Context           | inverse; at ±2% contributes at most ±1    |
| US 10Y real-yield 30-day change           | Monetary conditions | Coincident        | inverse; ±0.15pp moderate, ±0.50pp strong |
| US net-liquidity 30-day change            | Liquidity           | Leading           | ±1% moderate, ±5% strong                  |

The official ICE DXY remains absent and is never imputed. `DOLLAR_STRENGTH_ECB_90D` is derived from `DXY_PROXY_ECB`: a decline of at least 2% contributes +1, a rise of at least 2% contributes -1, and the range between contributes zero. Missing or stale proxy data is excluded rather than inserted as zero. FRED `US_BROAD_DOLLAR_INDEX` is validation-only; directional divergence adds a warning and lowers confidence. Macro requires at least two independent families.

## Crypto-liquidity regime

| Factor                          | Family                  | Timing hypothesis | Normalization hypothesis                      |
| ------------------------------- | ----------------------- | ----------------- | --------------------------------------------- |
| Stablecoin supply 30-day change | Crypto-native liquidity | Leading           | ±0.5% moderate, ±2% strong                    |
| BTC ETF aggregate flow          | Institutional flows     | Confirming        | 5-day ±$500M; 20-day ±$2B strong thresholds   |
| ETH ETF aggregate flow          | Institutional flows     | Confirming        | 5-day ±$100M; 20-day ±$400M strong thresholds |

ETF factors combine 5-day and 20-day windows. One daily flow cannot independently create a major regime transition. At least two of three factor families must be available.

## Asset regimes

BTC uses price versus 200DMA, the 20-day direction of its 50DMA and BTC ETF rolling flow. ETH uses the same structure plus the 30-day ETH/BTC trend.

| Factor                       | Moderate hypothesis           | Strong hypothesis |
| ---------------------------- | ----------------------------- | ----------------- |
| Price versus 200DMA          | Above/below long-term average | ±10% distance     |
| 50DMA direction over 20 days | Positive/negative             | ±3%               |
| ETH/BTC 30-day trend         | Positive/negative             | ±5%               |

Daily closes are derived deterministically from the last valid observation per UTC day. A minimum 200-day history is mandatory for the long-term factor.

## Aggregation and missing data

Valid factor scores are first averaged within their family, after which families receive equal weight and are mapped to the five-state scale at ±0.5 and ±1.5 boundaries. This prevents several indicators from one family from outvoting a distinct family. Missing, stale and insufficient-history factors do not contribute zero. Each regime exposes factor-level coverage, factor status and warnings. Strong outputs are blocked whenever coverage is incomplete.

## Validation status

These thresholds have not been statistically calibrated. Promotion from `HYPOTHESIS` requires historical replay without look-ahead bias and evaluation of forward returns, adverse excursion, regime duration and false-transition rate.

The experience therefore exposes `MODEL VALIDATION = UNVALIDATED` separately from input confidence. A fresh, complete and internally consistent snapshot can have high data confidence while the model itself remains unvalidated. Daily shadow evidence is stored in `trust_observations`; it cannot by itself promote the model without the historical validation gate above.

Historical evidence has two non-interchangeable modes. `RECONSTRUCTED` uses present stored history and is descriptive only. `POINT_IN_TIME` requires `observed_at <= evaluation_at` and proven `available_at <= evaluation_at`, where availability is raw receipt time or derived calculation time. Observation dates and provider backfills are never sufficient availability proof.
