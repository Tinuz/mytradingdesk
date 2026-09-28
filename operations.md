# Operations

## Daily cycle

The scheduled workflow `.github/workflows/shadow-cycle.yml` runs once a day after its repository secrets are configured:

1. `npm run shadow:cycle`: ingestion, derivation, data-quality sync, regimes, decisions, alerts, trust capture, point-in-time audit and V1 gate assessment. The stages share one calculation time, and a failed cycle resumes at the failed stage when re-run on the same day.
2. `portfolio:snapshot`, `portfolio:lots`, `valuations:calculate`, `intelligence:calculate`, `allocations:calculate`, `portfolio:risk`, `paper:run`, `performance:calculate`, `outcomes:calculate`, `validation:monthly-report`, `capital:assess`.

`shadow:cycle` shares its calculation time with every later step (it exports `CYCLE_CALCULATION_AT`), and a re-run on the same day reuses the day's time. Jobs are idempotent per calculation time: re-running the workflow does not write a second recommendation or valuation. To re-run a single job by hand for an earlier cycle, set `CYCLE_CALCULATION_AT` to that cycle's `calculation_at` from `pipeline_cycles` (looked up by `cycle_key`, e.g. `shadow-2026-09-28`). Resolve critical data or source incidents before reviewing allocation changes.

## Ingestion

Each ingestion invocation is independently executable, idempotent and records provider failures rather than manufacturing data.

Every script needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Ingestion requires `FRED_API_KEY`, `TWELVE_DATA_API_KEY` and `COINALYZE_API_KEY` (perpetual open interest); `SOSOVALUE_API_KEY` enables ETF flows (skipped without it in `ingest:live`, required by `backfill:crypto-credit`). `COINGECKO_API_KEY` is optional where the selected plan permits unauthenticated calls, and `RESEND_API_KEY` with `ALERT_EMAIL_FROM` is optional for email. The workflow's `env` block and `.env.example` list the same variables. The ECB dollar-proxy feed is keyless. Never expose provider secrets through `NEXT_PUBLIC_` variables.

Source approval is an immutable legal/operations action, never inferred from a successful HTTP request. After reviewing the exact terms, run `npm run governance:review-source` with `SOURCE_REVIEW_ACK=I_HAVE_REVIEWED_TERMS` plus `SOURCE_PROVIDER`, `SOURCE_APPROVAL`, `SOURCE_AUTOMATION_RIGHTS`, `SOURCE_HISTORICAL_STORAGE_RIGHTS`, `SOURCE_TERMS_URL`, `SOURCE_FRESHNESS_CONTRACT`, `SOURCE_FALLBACK_POLICY` and `SOURCE_REVIEW_NOTES`. Until then allocation remains fail-closed.

Dollar strength is collected through two separate series. `DXY_PROXY_ECB` uses one batched ECB SDMX request for USD, JPY, GBP, CAD, SEK and CHF reference rates; its 90-day change is active as the capped `DOLLAR_STRENGTH_ECB_90D` hypothesis in Regime Engine `0.5.1-hypothesis.1` (carried forward unchanged in `0.5.2`). `US_BROAD_DOLLAR_INDEX` uses FRED `DTWEXBGS` for validation only. Run `npm run backfill:dollar-strength` for a ten-year backfill and `npm run audit:dollar-strength` to inspect directional agreement. Official `DXY` remains unavailable.

## Source publication cadence

The daily cycle requests every source once per day; extra runs are manual (`npm run ingest:live`, `npm run ingest:v3-live`). Sources publish at different rates:

- Stablecoin aggregate: at most one new observation per day.
- BTC/ETH ETF flows: daily after US market data publication.
- US net liquidity: weekly after the H.4.1 publication; the job reconciles all three FRED components on the same observation date.

Manual verification commands are `npm run smoke:providers`, `npm run smoke:global-liquidity`, `npm run smoke:dollar-strength` (live provider calls without persisting), `npm run ingest:live` and `npm run backfill:phase2`. They require secrets loaded from the ignored `.env.local`. Repeating a live or backfill command is safe: a repeated observation is recorded as a duplicate, never as extra canonical history. `node tests/smoke/database.mjs` checks a hosted, migrated database through `CMIP_DB_URL` (it requires TLS, so it does not run against the local Supabase).

## Regime and decision evaluation

Use `npm run backfill:phase3` to obtain the 300-day BTC, ETH and real-yield history required for moving averages and 30-day factors. `npm run evaluate:v3-regimes` evaluates and stores the regime snapshots and `npm run evaluate:v3-decisions` the decision snapshots; the daily `npm run shadow:cycle` runs both. Neither emits alerts.

## Engine versions and rollback

A decision engine version is immutable once snapshots reference it. The decision stage loads the most recent compatible decision snapshot as transition memory and the current regime snapshots, then persists a decision snapshot that references all four source regime snapshots. Regime and decision snapshots are written in separate stages. Retry safety is enforced by asset, calculation timestamp and engine version. Historical replay must use separate memory per asset and must never invoke notifications.

For rollback, deactivate the current engine version and activate a previously reviewed version through a new forward migration. Do not rewrite historical snapshots or edit an applied migration. Every engine change is recorded in the [signal-model changelog](signal-model.md#engine-changelog). If a migration moves the alert watermark (as `202609280037` does), apply it after a completed daily cycle, so no snapshot is skipped before it is alerted.

## Dashboard

The authenticated routes `/dashboard`, `/assets/btc`, `/assets/eth`, `/history` and `/research` read only stored snapshots and protected health views. If they show no current evaluation, verify the snapshot job rather than adding UI fallback values. The dashboard does not present decisions older than 30 minutes as current; with a once-daily cycle it therefore usually shows them as stale, which is expected and not an incident. History rows and alerts link to immutable decisions through `/assets/{symbol}?decision={id}`. The daily work happens on `/today`, `/allocation` and `/paper`. If data health shows stale or missing observations, follow the provider-outage/backfill procedure before re-evaluating.

## Database setup and rollback

Use `npx supabase db reset` only for a disposable local database. Production schema changes use forward-only reviewed migrations. Never edit a migration already applied to a shared environment. A rollback is a new compensating migration after its exact target and data consequences are reviewed.

## Secrets

Browser code receives only the Supabase URL and anonymous key. Service-role and provider keys are server-side secrets and must never be logged. `.env*` files are ignored except for the documented example.

## Provider outage

Record `PROVIDER_FAILURE`; do not change canonical-provider configuration. Evaluate staleness, ingest an approved fallback only under its explicit role, and after recovery detect missing intervals and call `fetchRange`. Historical recovery mode must not emit alerts.

## Quarantined data

Quarantined raw payloads remain immutable. Review the reason, payload and nearby provider values. Never update the row to `VALID`; ingest a provider correction as a new revision.

## Manual backfill

Choose one indicator, provider and explicit UTC range. Confirm backfill support, request the range, run semantic validation, and inspect missing-interval events. Large ranges must respect plan-specific granularity and output limits.

## Alerts

Run `npm run alerts:live` only after the live decision and data-quality jobs. Migration 015 records a `live_since` watermark, so existing snapshots and quality events cannot generate activation noise. `npm run alerts:historical` always returns zero alerts and is required for replay or backfill.

In-app delivery is enabled by default. Email is opt-in on `/notifications` and requires server-only `RESEND_API_KEY` and `ALERT_EMAIL_FROM`. The sender domain must be verified with Resend. Database fingerprints prevent duplicate alerts permanently; Resend idempotency protects email retries for 24 hours. The default cooldown is 24 hours per alert type and asset.

## Validation

`npm run validation:replay` never invokes alerts and does not rewrite market or decision history. It creates a new immutable validation run plus daily replay points, shown at `/validation`; `/research` shows data quality and the accumulating shadow record. The current methodology is `RECONSTRUCTED`; do not relabel it as point-in-time because backfilled observations were received after their historical dates and not every provider exposes historical vintages.

Run `npm run validation:audit-point-in-time` after ingestion and derivation. It accepts only raw `received_at` or derived `created_at` as proof that a value was knowable. Late backfills remain usable for evaluations after receipt but can never be moved backward into earlier historical decisions. Gate 2 requires every V1 indicator and 90 prospective days; a `BLOCKED` result is expected until both conditions are met.

## Validation-and-trust observation

`shadow:cycle` runs `trust:capture` after the live evaluation and alert stages; run it by hand only after a manual evaluation. The daily row is idempotently refreshed and retains aggregate data-health, pipeline-delay, transition and alert evidence for a rolling operational review. `UNVALIDATED` may not be promoted manually: promotion requires a reviewed point-in-time replay, forward-return and adverse-excursion analysis, baseline comparison, acceptable false-transition rate, and a separate versioned migration.

## Allocation and paper portfolio

`allocations:calculate` writes one recommendation per user per calculation time; a user without a mandate is skipped. It fails closed: unapproved sources, inactive methodologies, a missing decision snapshot or valuation, a hard thesis invalidator, or open `CRITICAL` or `HIGH` data-quality events freeze it.

The user decides on the newest recommendation in the app. `paper:run` processes the latest decision exactly once, at the first valuation after it was made:

- Only a decision on an `AVAILABLE` recommendation executes. `APPROVE` executes at the target midpoints. `MODIFY` executes modified ranges at their middle and never below the mandate's minimum cash.
- `REJECT` and `DEFER` change nothing.
- When the newest recommendation is not `AVAILABLE`, increases are blocked and only risk reduction executes.
- Anything skipped needs a new decision; an old approval never executes later at other prices.

A portfolio is valued once per calculation time. A rerun after an interrupted run re-applies trades recorded since the previous valuation instead of dropping them from the book.

Outcomes use only `VALID` prices. An outcome whose exit price cannot arrive within two days of its horizon is recorded as `UNAVAILABLE`. Readers use the active methodology version only.
