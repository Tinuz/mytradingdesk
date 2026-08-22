# Crypto Macro Intelligence Platform

An explainable, deterministic macro and crypto regime detection system for disciplined long-term investing. The platform reports changes in conditions; it does not predict prices, execute trades, or provide personalized allocation advice.

## Current status

The v3 analytical pipeline is active across four independent layers. Decision Engine `0.6.0-hypothesis.1` produces explainable BTC and ETH decisions. Alert Engine `0.7.0-hypothesis.1` turns only new live material changes into deduplicated in-app notifications and optional email. Exact DXY/NYICDX remains an explicit backlog exception.

## Requirements

- Node.js 22 Active LTS (Node 20.9+ is accepted by Next.js)
- npm 11+
- Docker and Supabase CLI for a local database migration smoke test

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set the required values in the ignored root `.env.local`; the web workspace loads that shared file during local development. Never place the service-role secret in a `NEXT_PUBLIC_` variable.

## Gate 0

```bash
npm run typecheck
npm run lint
npm test
npm run test:migrations
npm run build
npx playwright install chromium
npm run test:e2e
```

The repository test verifies migration structure without Docker. For execution against PostgreSQL, run `supabase start` followed by `supabase db reset`.

## Phase 1 verification

```bash
npm test
npm run smoke:providers
supabase db reset
```

The automated suite covers malformed/missing units and values, extreme changes, staleness, duplicates, discrepancies, explicit fallback behavior, provider failure, missing intervals and backfill recovery. The live smoke command retrieves recent BTC, ETH and real-yield observations plus Twelve Data fallback data without persisting them. DXY stays explicitly unavailable until licensed ICE access or another exact approved source is configured.

## Workspace

- `apps/web`: Next.js experience and Supabase Auth UI
- `packages/domain`: shared, closed domain vocabulary
- `packages/signal-engine`: framework-independent intelligence boundary
- `packages/providers`: ingestion abstractions (no integrations in Phase 0)
- `packages/database`: database client construction
- `packages/notifications`: deterministic alert selection, deduplication and cooldown
- `supabase`: migrations, local configuration, and seed
- `tests`: migration and browser tests

See [architecture.md](architecture.md), [signal-model.md](signal-model.md), and [operations.md](operations.md).

The six validation gates required for V1.0 are tracked in [V1-roadmap.md](V1-roadmap.md).

## Phase 5 verification

Run `npm run evaluate:persist` after ingestion to persist an idempotent regime/decision snapshot. Authenticated users can then inspect `/dashboard`, `/assets/btc`, `/assets/eth`, `/history`, and `/research`. The web application only reads stored intelligence output and contains no decision rules.

## Phase 7 dashboard

The authenticated dashboard presents all four v3 layers separately, keeps opportunity and risk signals distinct, and links history rows to immutable decision snapshots through `/assets/{symbol}?decision={id}`. Asset detail pages expose the exact factor breakdown, risk drivers, contradictions and data warnings used at evaluation time.

## Phase 8 alerts

Run `npm run alerts:live` after live decision evaluation and data-quality synchronization. `npm run alerts:historical` is intentionally inert. In-app notifications are enabled by default at `/notifications`; email is opt-in and requires `RESEND_API_KEY` plus `ALERT_EMAIL_FROM` for a verified domain.

## Validation and trust

The model is explicitly `UNVALIDATED`; confidence describes input quality, not expected return. Run `npm run trust:capture` once after every completed daily pipeline cycle. It records freshness, missing data, quality issues, snapshot/transition counts, alerts and pipeline delay. The dashboard refuses to present decisions older than 30 minutes as current, while `/research` distinguishes canonical from derived observations and exposes the accumulating 90-day shadow record.

Run `npm run validation:replay` to rebuild the current historical evidence. Until availability timestamps and vintages pass Gate 2, the output is labelled `RECONSTRUCTED`, never `POINT_IN_TIME`, and is visible at `/validation`.

Run `npm run validation:audit-point-in-time` after the daily pipeline. The audit uses persisted receipt/calculation time as availability proof, reports late backfills, and blocks Gate 2 until all required inputs are present and at least 90 prospective days have accumulated.
