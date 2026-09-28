# Architecture

## Domain boundaries

The system has five explicit domains:

1. **Ingestion** communicates with providers, validates, reconciles and persists observations.
2. **Intelligence** calculates indicators, independent regimes, deterministic decisions and explanation facts.
3. **Allocation and paper portfolio** turns decisions into mandate-bound target ranges, records human decisions and runs the paper portfolio, benchmarks and outcomes.
4. **Notification** detects meaningful changes, deduplicates, persists and delivers alerts.
5. **Experience** renders the authenticated app: the daily Vandaag → Beslissen → Resultaat flow plus the advanced research, validation, portfolio and governance views.

Dependencies point inward. `apps/web` may consume structured output, but signal logic may never live in React or Next.js. `packages/signal-engine` may depend only on domain types/configuration and has no runtime dependency on Next.js, React, Supabase, or providers.

```text
providers -> raw observations -> canonical observations -> indicator snapshots
  -> regime snapshots -> signal engine -> decision snapshots -> notifications
  -> allocation recommendations -> human decision -> paper portfolio -> outcomes
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

Supabase provides PostgreSQL, Auth and RLS. Scheduling is done by the GitHub Actions workflow `.github/workflows/shadow-cycle.yml`, which runs the operational scripts once a day. Service-role credentials remain server-side. Provider calls and protected operational access occur through trusted server boundaries. Portable packages keep long-running ingestion movable to a worker service.

## Failure handling

Jobs must be idempotent and independently retryable. Provider failure, staleness, anomaly quarantine and reconciliation disagreement are explicit states. Missing or invalid data reduces confidence and can block escalation; it is never silently replaced.

## Ingestion

`packages/providers` contains provider-neutral contracts, adapters, semantic validation, reconciliation, gap detection and orchestration. It has no Supabase or signal-engine dependency. `packages/database` implements the Supabase repository port; tests use an in-memory implementation. This keeps provider communication, financial validation and persistence testable without UI or intelligence code.

Raw and canonical rows have database-level update/delete guards. Provider corrections append a revision with vintage timing. Canonical insertion keys off the immutable source observation, while provider observations use provider, indicator, timestamp and provider reference for idempotency.

Composite series derive only a transparent, unit-normalized observation from aligned source components: same-date components for US net liquidity, and for the G3 central-bank-assets proxy the latest value of each component at or before the `JPNASSETS` anchor. They perform no regime classification, and the raw payload keeps every component, series identifier and formula for replay and audit.

Dollar strength follows the same provenance rule without pretending proxy equivalence. `DXY_PROXY_ECB` stores the six ECB reference-rate components, public basket formula, fixing limitation and methodology version in every raw payload. Its 90-day change is active as the capped `DOLLAR_STRENGTH_ECB_90D` hypothesis factor. `US_BROAD_DOLLAR_INDEX` stores FRED `DTWEXBGS` separately and is validation-only; divergence lowers confidence without adding a duplicate score. Official `DXY` remains empty.

## Intelligence

`packages/signal-engine` consumes only structured observations and domain types. It has no dependency on providers, Supabase, Next.js or React. It returns four independent regimes (macro liquidity, crypto credit, market structure and one per asset), each with score, state, factor breakdown, coverage and warnings.

Every evaluation is a pure function of observations, evaluation time and configuration version. Missing or stale data is excluded rather than coerced to neutral. Scripts paginate their reads explicitly so API row limits cannot silently create stale model inputs.

The decision engine maps the regime scores through a complete versioned matrix. Opportunity uses macro liquidity, crypto credit and the asset regime. Market Structure is independent stress governance: it caps the emitted state and is never added to the opportunity score. Both axes are persisted, and the experience layer may not reconstruct either classification. Transition memory is explicit input and output, so hysteresis and two-observation persistence are deterministic and replayable rather than hidden process state. Database persistence is an adapter responsibility; idempotency indexes protect snapshots from job retries.

## Capital allocation and paper portfolio

Allocation is shadow decision support. User-owned investor mandates are append-only versions protected by RLS; a change creates a new row instead of rewriting the mandate used by historical evidence. Recommendations reference the exact mandate, decision, valuation, scenario, risk-policy and allocation-policy versions. No component has trading or withdrawal authority.

A human decision (approve, modify, reject, defer) is recorded separately from the model output. The rules for target ranges and the mandate's cash floor live in `packages/domain`, so the sign-off form validates exactly what the paper engine executes. The paper engine processes the latest decision once, at the next valuation, and a freeze on the newest recommendation blocks new exposure. Trade planning, the four frozen `benchmark-v1` benchmarks and recommendation outcomes are pure functions in `packages/signal-engine`. Their state is stored with a methodology version.

Methodology versions and source-governance decisions are append-only. Technical API access never implies automation or historical-storage rights; unreviewed providers remain `REVIEW_REQUIRED`. Portfolio accounts and transactions are user-owned under RLS, transactions are immutable, and portfolio snapshots retain the exact mandate, price observations and calculation version used.

## Experience

Authenticated React Server Components read security-invoker database views through the user's Supabase session. The auth proxy protects every page segment, and a test enforces this. `decision_experience` reconstructs the referenced regimes for each immutable decision snapshot; `indicator_health` exposes only canonical values, freshness and provider provenance. Raw payloads and provider credentials never enter the experience boundary. Pages contain formatting and navigation only, with no thresholds, matrix rules or transition logic. Stored codes are translated to Dutch labels in the experience layer only.

## Notification

`packages/notifications` deterministically classifies material live transitions and is independent of Supabase and email providers. PostgreSQL provides permanent per-user fingerprint uniqueness and cooldown history. Resend provides optional email with a second idempotency boundary; the authenticated inbox remains protected by per-user RLS.
