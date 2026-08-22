# Backlog

## Data sources

### DXY / NYICDX canonical ingestion

- **Status:** Deferred by product decision on 2026-08-22
- **Reason:** Twelve Data does not expose the exact index under the configured entitlement; Yahoo Finance has no approved automated market-data API for this use; ICE access requires a separate licence.
- **Required before activation:** documented exact DXY/NYICDX source, automation and historical-storage rights, current and historical endpoint validation, freshness contract, backfill test, failure simulation and reconciliation policy.
- **Prohibited shortcut:** do not substitute a Federal Reserve trade-weighted dollar index or scrape Yahoo Finance.
- **Current runtime behavior:** `SOURCE_FAILURE` / `UNKNOWN`; DXY cannot influence a regime.

This item does not authorize adding a proxy to the DXY factor. Any future activation requires a reviewed provider change and tests.
