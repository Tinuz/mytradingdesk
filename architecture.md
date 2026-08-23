# Architecture

## Domain boundaries

The system has four explicit domains:

1. **Ingestion** communicates with providers, validates, reconciles, and persists observations.
2. **Intelligence** calculates indicators, independent regimes, deterministic decisions, and explanation facts.
3. **Notification** detects meaningful changes, deduplicates, persists, and delivers alerts.
4. **Experience** renders authenticated dashboard, history, research, and settings views.

Dependencies point inward. `apps/web` may consume structured output, but signal logic may never live in React or Next.js. `packages/signal-engine` may depend only on domain types/configuration and has no runtime dependency on Next.js, React, Supabase, or providers.

```text
providers -> raw observations -> canonical observations -> indicator snapshots
  -> regime snapshots -> signal engine -> decision snapshots -> notifications
                                                       -> web experience
```

## Data flow and auditability

```text
external source
  -> immutable provider payload
  -> structural and semantic validation
  -> reconciliation with explicit provenance
  -> canonical observation
  -> versioned indicator and regime snapshots
  -> versioned deterministic decision
  -> transition evaluation
  -> deduplicated alert
```

Raw history is append-only by application policy. Corrections create new rows. Historical replay must select only information whose publication/receipt timing made it available at the evaluation time.

## Supabase responsibilities

Supabase provides PostgreSQL, Auth, RLS and later simple scheduled invocation. Service-role credentials remain server-side. Provider calls and protected operational access occur through trusted server boundaries. Portable packages keep long-running ingestion movable to a worker service.

## Failure handling

Jobs must be idempotent and independently retryable. Provider failure, staleness, anomaly quarantine and reconciliation disagreement are explicit states. Missing or invalid data reduces confidence and can block escalation; it is never silently replaced.

## Phase 1 ingestion components

`packages/providers` contains provider-neutral contracts, adapters, semantic validation, reconciliation, gap detection and orchestration. It has no Supabase or signal-engine dependency. `packages/database` implements the Supabase repository port; tests use an in-memory implementation. This keeps provider communication, financial validation and persistence testable without UI or intelligence code.

Raw and canonical rows have database-level update/delete guards. Provider corrections append a revision with vintage timing. Canonical insertion keys off the immutable source observation, while provider observations use provider, indicator, timestamp and provider reference for idempotency.

Phase 2 adds two direct canonical series and one derived observation series. The FRED liquidity adapter derives only a transparent unit-normalized observation from same-date source components; it performs no regime classification. Its raw payload retains every component, series identifier and formula for replay and audit.

Dollar strength follows the same provenance rule without pretending proxy equivalence. `DXY_PROXY_ECB` stores the six ECB reference-rate components, public basket formula, fixing limitation and methodology version in every raw payload. Its 90-day change is active as the capped `DOLLAR_STRENGTH_ECB_90D` hypothesis factor. `US_BROAD_DOLLAR_INDEX` stores FRED `DTWEXBGS` separately and is validation-only; divergence lowers confidence without adding a duplicate score. Official `DXY` remains empty.

## Phase 3 intelligence

`packages/signal-engine` consumes only structured observations and domain types. It has no dependency on providers, Supabase, Next.js or React. The engine separately returns macro, crypto-liquidity, BTC-asset and ETH-asset results with score, state, factor breakdown, coverage and warnings. It does not emit a decision state.

Every evaluation is a pure function of observations, evaluation timestamp and configuration version. Missing/stale data is excluded rather than coerced to neutral. The database evaluation script paginates canonical history explicitly so API row limits cannot silently create stale model inputs.

## Phase 4 intelligence

The same framework-independent package maps the three separately visible regime scores through a complete versioned decision matrix. Transition memory is explicit input/output, so hysteresis and two-observation persistence are deterministic and replayable rather than hidden process state. Confidence and explanation facts are structured engine output. Database persistence remains an adapter responsibility; idempotency indexes protect regime and decision snapshots from job retries. Alerts remain outside the engine and inactive until Phase 6.

## Phase 5 experience

Authenticated React Server Components read security-invoker database views through the user's Supabase session. `decision_experience` reconstructs the three referenced regimes for each immutable decision snapshot; `indicator_health` exposes only canonical values, freshness and provider provenance. Raw payloads and provider credentials never enter the experience boundary. Dashboard, asset drill-down, history and research pages contain formatting and navigation only—no thresholds, matrix rules or transition logic.

## Phase 8 notification

`packages/notifications` deterministically classifies material live transitions and is independent of Supabase and email providers. PostgreSQL provides permanent per-user fingerprint uniqueness and cooldown history. Resend provides optional email with a second idempotency boundary; the authenticated inbox remains protected by per-user RLS.

## Phase boundary

Phase 0 creates boundaries and storage only. Provider calls begin in Phase 1, regime logic in Phase 3, decisions are active in Phase 4, the operational dashboard begins in Phase 5, and alerts in Phase 6.
