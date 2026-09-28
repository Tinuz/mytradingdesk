# Crypto Macro Intelligence Platform

A personal research tool for disciplined, long-term BTC and ETH investing. It turns macro and crypto market data into explainable, versioned regimes and decisions. It proposes allocation ranges as **shadow** decision support, records your own decision, and measures the outcome with a **paper portfolio**.

It does not predict prices, place orders, use leverage or touch real money. The model is explicitly `UNVALIDATED` until the gates in [V1-roadmap.md](V1-roadmap.md) pass. Confidence describes input quality, not expected return.

## How it works

```text
providers → validated, immutable observations → derived indicators
  → four independent regimes (macro liquidity, crypto credit, market structure, asset)
  → decision per asset (opportunity capped by market stress)
  → allocation ranges within your mandate → your decision → paper portfolio
  → outcomes and benchmarks → validation evidence
```

- Every calculation is deterministic and carries an engine or methodology version. Changes are recorded in the [signal-model changelog](signal-model.md#engine-changelog).
- Missing, stale or quarantined data is never replaced silently. It lowers confidence or blocks new exposure.
- The web app only reads stored results; no decision logic lives in React.

The app follows the same three steps every day:

1. **Vandaag**: what changed and whether a decision is needed.
2. **Beslissen**: review the proposed ranges and approve, modify, reject or defer them.
3. **Resultaat**: the paper portfolio against four frozen benchmarks.

The advanced view adds market research, data quality, validation, the mandate, the real portfolio ledger and governance.

## Current status

| Component       | Version                     |
| --------------- | --------------------------- |
| Regime engine   | `0.5.2-hypothesis.1`        |
| Decision engine | `0.6.3-hypothesis.1`        |
| Alert engine    | `0.7.1-hypothesis.1`        |
| Paper NAV       | `paper-nav-v2`              |
| Outcomes        | `recommendation-outcome-v2` |

Exact DXY/NYICDX is not licensed. A separately named, capped ECB-derived dollar-strength hypothesis is used instead, and the FRED broad-dollar series serves only for validation (see [backlog.md](backlog.md)).

## Workspace

| Path                     | Contents                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- |
| `apps/web`               | Next.js app with Supabase Auth (Dutch UI)                                         |
| `packages/domain`        | Shared vocabulary and pure rules used by both web and engine (e.g. target ranges) |
| `packages/signal-engine` | Framework-free regimes, decisions, allocation, paper mechanics and outcomes       |
| `packages/providers`     | Provider adapters, validation, reconciliation and the ingestion pipeline          |
| `packages/database`      | Supabase implementation of the ingestion repository                               |
| `packages/notifications` | Alert selection, deduplication and cooldown                                       |
| `scripts`                | Operational jobs run by the daily cycle and by hand                               |
| `supabase`               | Forward-only migrations, local configuration and seed                             |
| `tests`                  | Migration, route, web-helper, smoke and Playwright tests                          |

## Local development

Requirements: Node.js 22, npm 11, and Docker with the Supabase CLI for a local database.

```bash
npm ci
cp .env.example .env.local   # fill in the values you need
npx supabase start           # local Postgres, Auth and REST API
npm run dev
```

The web workspace reads the root `.env.local`. Only `NEXT_PUBLIC_*` values may reach the browser; never put the service-role key in one.

Checks (CI runs all of them):

```bash
npm run format:check
npm run typecheck   # workspaces plus scripts and tests
npm run lint
npm test            # unit and migration tests
npm run build
npm run test:e2e    # Playwright; needs a Supabase URL and anon key
```

`npm run check` runs everything except the e2e tests.

## Operations

A scheduled GitHub Actions workflow ([`.github/workflows/shadow-cycle.yml`](.github/workflows/shadow-cycle.yml)) runs the daily cycle. It starts with `npm run shadow:cycle`, which covers ingestion, derivation, regimes, decisions, alerts, trust capture and gate assessment. After that it runs the portfolio, allocation, paper, performance and outcome jobs. Every job is idempotent and safe to re-run.

See [operations.md](operations.md) for runbooks: provider outages, backfills, quarantined data, source governance, alerts, validation and rollback.

## Documentation

- [architecture.md](architecture.md): domain boundaries and data flow
- [signal-model.md](signal-model.md): factors, regimes, decision rules and engine changelog
- [data-sources.md](data-sources.md): providers, units, freshness and limitations
- [operations.md](operations.md): running and recovering the system
- [V1-roadmap.md](V1-roadmap.md): the validation gates for V1.0
- [backlog.md](backlog.md): capital allocation epics and deferred work
- [instructions.md](instructions.md): engineering rules and change control
