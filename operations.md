# Operations

## Phase 1 ingestion

The portable ingestion pipeline is implemented, but scheduling is not activated without provider credentials and a migrated Supabase project. Intended cadence is BTC/ETH every 15 minutes, DXY hourly, and DFII10 daily after publication. Each invocation is independently executable, idempotent and records provider failures rather than manufacturing data.

Required server secrets are `SUPABASE_SERVICE_ROLE_KEY`, `FRED_API_KEY`, and `TWELVE_DATA_API_KEY`; `COINGECKO_API_KEY` is optional only where the selected plan permits unauthenticated calls. The ECB dollar-proxy feed is keyless. Never expose provider secrets through `NEXT_PUBLIC_` variables.

Source approval is an immutable legal/operations action, never inferred from a successful HTTP request. After reviewing the exact terms, run `npm run governance:review-source` with `SOURCE_REVIEW_ACK=I_HAVE_REVIEWED_TERMS` plus `SOURCE_PROVIDER`, `SOURCE_APPROVAL`, `SOURCE_AUTOMATION_RIGHTS`, `SOURCE_HISTORICAL_STORAGE_RIGHTS`, `SOURCE_TERMS_URL`, `SOURCE_FRESHNESS_CONTRACT`, `SOURCE_FALLBACK_POLICY` and `SOURCE_REVIEW_NOTES`. Until then allocation remains fail-closed.

Dollar strength is collected through two separate series. `DXY_PROXY_ECB` uses one batched ECB SDMX request for USD, JPY, GBP, CAD, SEK and CHF reference rates; its 90-day change is active as the capped `DOLLAR_STRENGTH_ECB_90D` hypothesis in Regime Engine `0.5.1-hypothesis.1` (carried forward unchanged in `0.5.2`). `US_BROAD_DOLLAR_INDEX` uses FRED `DTWEXBGS` for validation only. Run `npm run backfill:dollar-strength` for a ten-year backfill and `npm run audit:dollar-strength` to inspect directional agreement. Official `DXY` remains unavailable.

## Phase 2 ingestion

- Stablecoin aggregate: request every four hours; expect at most one new daily observation.
- BTC/ETH ETF flows: request daily after US market data publication using `SOSOVALUE_API_KEY`.
- US net liquidity: request after weekly H.4.1 publication; the job fetches and reconciles all three FRED components on the same observation date.

Manual verification commands are `npm run smoke:providers`, `npm run ingest:live`, and `npm run backfill:phase2`. They require secrets loaded from the ignored `.env.local`. Repeating the live or backfill command is safe and must produce duplicates rather than extra canonical history.

## Phase 3 evaluation

Use `npm run backfill:phase3` to obtain the 300-day BTC, ETH and real-yield history required for moving averages and 30-day factors. `npm run evaluate:v3-regimes` evaluates and stores the regime snapshots and `npm run evaluate:v3-decisions` the decision snapshots; the daily `npm run shadow:cycle` runs both. Neither emits alerts.

## Phase 4 engine operation

A decision engine version is immutable once snapshots reference it. Evaluation jobs must load the most recent decision snapshot as transition memory, evaluate the current regimes and persist a decision snapshot that references all four source regime snapshots. Regime and decision snapshots are written in separate stages. Retry safety is enforced by asset, calculation timestamp and engine version. Historical replay must use separate memory per asset and must never invoke notifications.

For rollback, deactivate the current engine version and activate a previously reviewed version through a new forward migration. Do not rewrite historical snapshots or edit an applied migration.

## Phase 5 snapshot and dashboard operation

After successful ingestion and derivation, run `npm run evaluate:v3-regimes` followed by `npm run evaluate:v3-decisions` (or the complete `npm run shadow:cycle`). Decisions restore per-asset transition memory from the latest compatible snapshot and never emit alerts.

The authenticated routes `/dashboard`, `/assets/btc`, `/assets/eth`, `/history` and `/research` read only stored snapshots and protected health views. If they show no current evaluation, verify the snapshot job rather than adding UI fallback values. If data health shows stale or missing observations, follow the provider-outage/backfill procedure before re-evaluating.

## Database setup and rollback

Use `supabase db reset` only for a disposable local database. Production schema changes use forward-only reviewed migrations. Never edit a migration already applied to a shared environment. A rollback is a new compensating migration after its exact target and data consequences are reviewed.

## Secrets

Browser code receives only the Supabase URL and anonymous key. Service-role and provider keys are server-side secrets and must never be logged. `.env*` files are ignored except for the documented example.

## Provider outage

Record `PROVIDER_FAILURE`; do not change canonical-provider configuration. Evaluate staleness, ingest an approved fallback only under its explicit role, and after recovery detect missing intervals and call `fetchRange`. Historical recovery mode must not emit alerts.

## Quarantined data

Quarantined raw payloads remain immutable. Review the reason, payload and nearby provider values. Never update the row to `VALID`; ingest a provider correction as a new revision.

## Manual backfill

Choose one indicator, provider and explicit UTC range. Confirm backfill support, request the range, run semantic validation, and inspect missing-interval events. Large ranges must respect plan-specific granularity and output limits.

## Phase 8 alerts

Run `npm run alerts:live` only after the live decision and data-quality jobs. Migration 015 records a `live_since` watermark, so existing snapshots and quality events cannot generate activation noise. `npm run alerts:historical` always returns zero alerts and is required for replay or backfill.

In-app delivery is enabled by default. Email is opt-in on `/notifications` and requires server-only `RESEND_API_KEY` and `ALERT_EMAIL_FROM`. The sender domain must be verified with Resend. Database fingerprints prevent duplicate alerts permanently; Resend idempotency protects email retries for 24 hours. The default cooldown is 24 hours per alert type and asset.

`npm run validation:replay` never invokes alerts and does not rewrite market or decision history. It creates a new immutable validation run plus daily replay points. The current methodology is `RECONSTRUCTED`; do not relabel it as point-in-time because backfilled observations were received after their historical dates and not every provider exposes historical vintages.

Run `npm run validation:audit-point-in-time` after ingestion and derivation. It accepts only raw `received_at` or derived `created_at` as proof that a value was knowable. Late backfills remain usable for evaluations after receipt but can never be moved backward into earlier historical decisions. Gate 2 requires every V1 indicator and 90 prospective days; a `BLOCKED` result is expected until both conditions are met.

## Validation-and-trust observation

Run `npm run trust:capture` after the final live evaluation and alert job, at least once per UTC day. The daily row is idempotently refreshed and retains aggregate data-health, pipeline-delay, transition and alert evidence for a rolling operational review. `UNVALIDATED` may not be promoted manually: promotion requires a reviewed point-in-time replay, forward-return and adverse-excursion analysis, baseline comparison, acceptable false-transition rate, and a separate versioned migration.
