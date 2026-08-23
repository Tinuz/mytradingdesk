# Backlog

## Data sources

### DXY / NYICDX canonical ingestion

- **Status:** Official series remains deferred; shadow-validation implementation approved on 2026-08-23
- **Reason:** Twelve Data does not expose the exact index under the configured entitlement; Yahoo Finance has no approved automated market-data API for this use; ICE access requires a separate licence.
- **Required before activation:** documented exact DXY/NYICDX source, automation and historical-storage rights, current and historical endpoint validation, freshness contract, backfill test, failure simulation and reconciliation policy.
- **Prohibited shortcut:** do not substitute a Federal Reserve trade-weighted dollar index or scrape Yahoo Finance.
- **Current runtime behavior:** `SOURCE_FAILURE` / `UNKNOWN`; DXY cannot influence a regime.

#### Implemented shadow-validation path

- `DXY_PROXY_ECB` reconstructs the public DXY basket formula from the six daily ECB reference rates. It is keyless, versioned as `ecb-dxy-proxy-v1`, and explicitly labelled as a derived proxy rather than an official ICE close.
- `US_BROAD_DOLLAR_INDEX` ingests FRED `DTWEXBGS` with `FRED_API_KEY` as an independent, broader dollar-strength validation series.
- `dollar_strength_validation` compares 30-day percentage direction; raw index levels are never compared because the series use different bases and baskets.
- Both series run in `SHADOW_VALIDATION`. Neither populates `DXY`, changes the DXY factor, activates a regime, or changes a historical decision.
- Commands: `npm run backfill:dollar-strength` and `npm run audit:dollar-strength`.
- Promotion requires at least 90 prospective days, reviewed directional-agreement evidence, calibrated thresholds, an explicit model-version change and a product decision about whether the model needs official DXY or a named dollar-strength proxy.

This item still does not authorize adding either shadow series to the DXY factor. Any future activation requires a reviewed model and provider change with tests.
