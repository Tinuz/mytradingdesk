# Backlog

## Data sources

### DXY / NYICDX canonical ingestion

- **Status:** Official series remains deferred; ECB-derived factor activated as a versioned hypothesis on 2026-08-23
- **Reason:** Twelve Data does not expose the exact index under the configured entitlement; Yahoo Finance has no approved automated market-data API for this use; ICE access requires a separate licence.
- **Required before activation:** documented exact DXY/NYICDX source, automation and historical-storage rights, current and historical endpoint validation, freshness contract, backfill test, failure simulation and reconciliation policy.
- **Prohibited shortcut:** do not substitute a Federal Reserve trade-weighted dollar index or scrape Yahoo Finance.
- **Current runtime behavior:** `SOURCE_FAILURE` / `UNKNOWN`; DXY cannot influence a regime.

#### Implemented shadow-validation path

- `DXY_PROXY_ECB` reconstructs the public DXY basket formula from the six daily ECB reference rates. It is keyless, versioned as `ecb-dxy-proxy-v1`, and explicitly labelled as a derived proxy rather than an official ICE close.
- `US_BROAD_DOLLAR_INDEX` ingests FRED `DTWEXBGS` with `FRED_API_KEY` as an independent, broader dollar-strength validation series.
- `dollar_strength_validation` compares 30-day percentage direction; raw index levels are never compared because the series use different bases and baskets.
- `DXY_PROXY_ECB` is active under its own factor name `DOLLAR_STRENGTH_ECB_90D` in Regime Engine `0.5.1-hypothesis.1`. Its 90-day change contributes at most `+1`, `0` or `-1`; it never populates official `DXY`.
- `US_BROAD_DOLLAR_INDEX` remains validation-only. Directional divergence adds a warning and prevents high confidence, but never contributes a second score.
- Commands: `npm run backfill:dollar-strength` and `npm run audit:dollar-strength`.
- Promotion requires at least 90 prospective days, reviewed directional-agreement evidence, calibrated thresholds, an explicit model-version change and a product decision about whether the model needs official DXY or a named dollar-strength proxy.

This item still does not authorize relabelling the proxy as official DXY. Promotion from `HYPOTHESIS` to `VALIDATED`, threshold changes or use of official DXY require a reviewed model/provider change with tests.

## Capital Allocation System

### Objective and safety boundary

Transform the application from a market-conditions terminal into an auditable, portfolio-aware capital allocation system:

```text
regime -> valuation -> thesis -> scenarios -> risk budget -> target range
       -> human approval -> paper allocation -> attribution -> recalibration
```

The first release is **decision support and paper allocation only**. It must not place orders, use leverage, or present unvalidated output as personalized financial advice. `instructions.md` currently prohibits allocation advice; changing that boundary requires an explicit, reviewed product decision before any allocation recommendation is exposed to users.

### Definition of done

A Capital Allocation V1 is complete only when the system can, for BTC, ETH and cash:

- reconstruct every recommendation point-in-time from immutable inputs and versioned methodology;
- separate opportunity, stress, valuation, data confidence and model evidence;
- calculate scenario-dependent expected return and downside without hiding assumptions;
- translate a user-owned mandate and risk budget into an allocation **range**, never a false-precision point target;
- record human approval or rejection separately from model output;
- run a preregistered paper portfolio with costs against declared benchmarks;
- explain performance through allocation, selection, timing and factor attribution;
- fail closed on missing, stale, unlicensed or insufficiently validated inputs;
- pass the validation and operational gates below before being labelled usable for live capital decisions.

### Delivery order

Items are ordered by dependency. P0 correctness and governance block all downstream allocation work. Portfolio recommendations remain `SHADOW` until CAS-060 through CAS-066 pass.

---

### Epic 0 — Correctness, semantics and governance (P0)

#### CAS-001 — Separate opportunity from market stress

- **Status:** Implemented and deployed on 2026-08-25 in Decision Engine `0.6.2-hypothesis.1`; a live BTC/ETH evaluation persisted both axes successfully.
- **Problem:** Market Structure is a risk/stress axis and must not be summed as ordinary opportunity points.
- **Build:** Produce independent, versioned `opportunity_state` and `stress_state` outputs in the signal engine and persist both.
- **Acceptance:** No React/UI code calculates investment state; all 25 opportunity/stress combinations have deterministic tests and documented semantics.
- **Blocks:** CAS-030, CAS-040, CAS-050.

#### CAS-002 — Versioned recommendation contract

- **Status:** Domain contract implemented; persistence remains blocked until mandate, valuation, scenario and risk-policy entities exist.
- **Build:** Define a domain contract containing regime references, valuation snapshot, scenario set, mandate version, risk result, target range, constraints, warnings and evidence status.
- **Acceptance:** Every displayed recommendation can be replayed byte-for-byte using stored version identifiers and point-in-time inputs.

#### CAS-003 — Evidence vocabulary

- **Build:** Standardize `HYPOTHESIS`, `SHADOW`, `VALIDATED` and `RETIRED` for factors, valuation methods, policies and complete recommendations.
- **Acceptance:** Data confidence, model evidence and thesis conviction are separate fields and separate UI labels; none is presented as probability of profit.

#### CAS-004 — Product and compliance boundary

- **Status:** Product boundary approved and documented on 2026-08-25 for BTC/ETH/cash `SHADOW` allocation decision support. Execution, leverage and claims of validated personalized advice remain prohibited; jurisdiction-specific compliance review remains required before any public/live-capital release.
- **Build:** Decide intended jurisdiction, personal-versus-multi-user scope, suitability requirements, disclaimers, retention and whether output is research, guidance or regulated advice.
- **Acceptance:** The decision is documented; `instructions.md`, UI language and feature flags agree; order execution and leverage remain out of scope unless separately authorized.

#### CAS-005 — Methodology registry and change control

- **Status:** Immutable version registry deployed on 2026-08-25 for factors, valuation, scenarios, risk, allocation and benchmarks. Registration workflow and activation enforcement remain open.
- **Build:** Register factor, valuation, scenario, risk and allocation-policy versions with rationale, owner, activation time, evidence and rollback rules.
- **Acceptance:** A model change cannot silently rewrite old recommendations or paper-portfolio history.

#### CAS-006 — Source licensing and data lineage register

- **Status:** Governance registry deployed on 2026-08-25. All existing providers deliberately start as `REVIEW_REQUIRED` with unknown automation/storage rights; legal/terms review and allocation fail-closed integration remain open.
- **Build:** Record provider, endpoint, terms, historical-storage rights, rate limits, fallback, freshness and cost for every allocation-critical input.
- **Acceptance:** Unapproved sources cannot feed a recommendation; critical inputs have a documented fallback or explicit fail-closed behavior.

---

### Epic 1 — Investor mandate and portfolio ledger (P0)

#### CAS-010 — Versioned investor mandate

- **Status:** Implemented and deployed on 2026-08-25. The authenticated `/mandate` workflow appends immutable user-owned versions; acceptance awaits creation of the first real user mandate.
- **Build:** Capture base currency, horizon, capital preservation target, maximum drawdown, minimum cash, maximum asset weight, turnover budget, allowed assets and rebalance cadence.
- **Acceptance:** Recommendations reference the exact mandate version used; changed mandates never alter historical output.

#### CAS-011 — Portfolio, cash and lot ledger

- **Status:** User-owned accounts, immutable transactions, BTC/ETH/cash holdings derivation and authenticated `/portfolio` manual-entry workflow are deployed. CSV import, reconciliation and tax-lot matching remain open.
- **Build:** Store accounts, assets, quantities, cash, fees, deposits/withdrawals, trades and tax lots through manual entry and CSV import first.
- **Acceptance:** Holdings, cash, cost basis and portfolio value reconcile to imported statements within a documented tolerance.
- **Note:** Exchange/API synchronization is a later optional adapter and must be read-only initially.

#### CAS-012 — Portfolio snapshots

- **Status:** Reproducible snapshot contract and `portfolio:snapshot` calculator implemented on 2026-08-25 with mandate, point-in-time price-observation and calculation-version references. Runtime completed with zero accounts; scheduling in the daily shadow cycle remains open.
- **Build:** Create immutable daily snapshots with positions, prices, weights, cash, cost basis and mandate reference.
- **Acceptance:** Any historical allocation decision can be evaluated against the portfolio actually known at that time.

#### CAS-013 — Benchmark definitions

- **Status:** Four `benchmark-v1` definitions were frozen and deployed on 2026-08-25. BTC/cash and 200DMA performance activation remains blocked until official free FRED `DGS3MO` cash-return ingestion exists.
- **Build:** Add BTC buy-and-hold, BTC/cash, static BTC/ETH and 200DMA benchmarks with explicit rebalance and cash-return rules.
- **Acceptance:** Deposits, withdrawals, fees and identical evaluation windows are handled consistently across strategy and benchmarks.

#### CAS-014 — Exposure and concentration view

- **Build:** Show asset, ecosystem, stablecoin, beta, liquidity and provider concentration plus rolling correlation.
- **Acceptance:** Pre-trade checks identify breaches of mandate limits and correlated concentration.

---

### Epic 2 — Valuation and fundamental intelligence (P0/P1)

#### CAS-020 — BTC on-chain valuation module

- **Build:** Add realized price/cap bands, MVRV percentile or Z-score, STH/LTH cost basis, SOPR, realized profit/loss, holder supply dynamics and miner selling where reliable sources permit.
- **Data:** Prefer free/public sources and self-derived metrics; evaluate Coin Metrics Community, Glassnode free-tier limitations, BGeometrics and direct Bitcoin-node derivation. Store source rights and vintage timing.
- **Acceptance:** At least two independent valuation families produce point-in-time fair-value bands; missing inputs reduce coverage rather than becoming neutral.

#### CAS-021 — BTC supply-demand balance

- **Build:** Compare ETF absorption, issuance, miner/exchange selling proxies, illiquid supply change and spot volume.
- **Acceptance:** The dashboard identifies the estimated marginal demand/supply drivers and their uncertainty without treating flows as valuation.

#### CAS-022 — ETH economic fundamentals

- **Build:** Track fees, revenue, issuance, burn, net inflation, staking participation/yield, validator economics, blobs/L2 economics, MEV, stablecoin share and DEX activity.
- **Data:** Prefer Ethereum RPC/beacon APIs, DefiLlama, ultrasound.money methodology where reproducible, Dune community datasets only when query lineage and storage rights are acceptable.
- **Acceptance:** Every metric documents whether and how value accrues to ETH holders; activity without token value capture cannot score as positive fundamentals by default.

#### CAS-023 — Relative valuation and opportunity cost

- **Build:** Compare BTC, ETH and cash/T-bills using expected real return, valuation percentile, relative strength and risk-adjusted scenario outcomes.
- **Acceptance:** “Attractive” always names the alternative and horizon against which it is attractive.

#### CAS-024 — Fundamental quality scorecard

- **Build:** Version a non-price scorecard for demand quality, unit economics, token dilution, value capture, decentralization/security and ecosystem concentration.
- **Acceptance:** Scores expose raw components and do not combine unrelated dimensions without documented weights and sensitivity tests.

#### CAS-025 — Valuation workbench

- **Build:** Allow analysts to inspect assumptions, ranges and sensitivity rather than only a single fair-value number.
- **Acceptance:** Changing any material assumption immediately shows its effect on fair value and expected downside; default assumptions are versioned.

---

### Epic 3 — Macro, flows and market positioning (P1)

#### CAS-030 — Business-cycle and financial-conditions layer

- **Build:** Add growth, inflation, labor, credit spreads, lending conditions, fiscal impulse and Treasury-liquidity context alongside current liquidity indicators.
- **Data:** Prefer FRED, Treasury Fiscal Data, BLS, BEA, ECB and other official free APIs.
- **Acceptance:** Liquidity and growth are independent axes; publication lag and revisions are point-in-time safe.

#### CAS-031 — Capital rotation map

- **Build:** Track flows among cash/stablecoins, BTC, ETH and supported ecosystems using ETF, stablecoin, bridge, exchange and DeFi flows.
- **Data:** Prefer DefiLlama, official ETF issuer data, SEC filings and reproducible chain queries; paid sources remain optional reconciliation providers.
- **Acceptance:** New external capital is distinguished from internal crypto rotation wherever evidence permits.

#### CAS-032 — Derivatives and positioning module

- **Build:** Add funding, futures basis/term structure, liquidations, spot-versus-derivatives volume and options volatility/skew.
- **Data:** Prefer exchange public APIs and Deribit; use CoinGlass/Laevitas only after licensing and historical-access review.
- **Acceptance:** Exchange coverage, missing venues and contract normalization are visible; open interest alone cannot determine direction.

#### CAS-033 — Event and catalyst calendar

- **Build:** Maintain FOMC/CPI/payrolls, ETF events, protocol upgrades, token unlocks and thesis review dates.
- **Acceptance:** Events are linked to affected theses and snapshots; calendar events never automatically create trades.

#### CAS-034 — Source redundancy and reconciliation

- **Build:** Assign primary/secondary sources to allocation-critical prices, flows and fundamentals with discrepancy thresholds.
- **Acceptance:** Material disagreement blocks increased exposure and produces an auditable quality event.

---

### Epic 4 — Thesis and scenario engine (P0/P1)

#### CAS-040 — Structured asset thesis

- **Build:** Extend the journal with thesis, causal drivers, assumptions, catalysts, counter-thesis, invalidators, review date and linked evidence.
- **Acceptance:** A recommendation above the current weight is impossible without an active, reviewed thesis.

#### CAS-041 — Bull/base/bear scenarios

- **Build:** Store scenario horizon, assumptions, valuation outcome, probability range, catalysts and invalidators.
- **Acceptance:** Probabilities sum to 100%, are explicitly analyst inputs until calibrated, and retain their historical vintage.

#### CAS-042 — Expected-return distribution

- **Build:** Calculate scenario-weighted return, downside, upside/downside ratio and sensitivity to probability and valuation assumptions.
- **Acceptance:** The UI shows the complete distribution and assumption sensitivity; it never presents expected return as guaranteed.

#### CAS-043 — Thesis health and contradiction detection

- **Build:** Map incoming observations to supporting, contradicting or irrelevant evidence without allowing an LLM to change scores or allocation.
- **Acceptance:** Hard invalidators trigger mandatory review/freeze; narrative generation remains downstream of deterministic facts.

#### CAS-044 — Analyst sign-off workflow

- **Build:** Record approve, modify, reject or defer, with rationale and review date, independently of model output.
- **Acceptance:** Human action never mutates the original recommendation and is included in later attribution.

---

### Epic 5 — Risk and allocation policy engine (P0)

#### CAS-050 — Portfolio risk model

- **Build:** Compute volatility, drawdown, rolling correlation, beta, liquidity risk, concentration, scenario loss and stress tests.
- **Acceptance:** Risk calculations use point-in-time holdings and prices, disclose window/sample limitations and fail closed when coverage is insufficient.

#### CAS-051 — Explicit risk budget

- **Build:** Translate the mandate into limits for total risky assets, per-asset exposure, portfolio volatility, scenario loss, drawdown and cash floor.
- **Acceptance:** Every recommendation shows remaining risk capacity and each binding constraint.

#### CAS-052 — Allocation policy

- **Build:** Map opportunity, stress, valuation, thesis health and risk capacity into target allocation ranges for BTC, ETH and cash.
- **Acceptance:** Policy is deterministic, versioned, fully unit-tested and monotonic under defined conditions; stress can cap exposure but cannot masquerade as opportunity.

#### CAS-053 — Rebalance and no-trade bands

- **Build:** Add minimum trade size, drift thresholds, cooldown and turnover/cost controls.
- **Acceptance:** Small signal changes do not create churn; all proposed changes show estimated fees, spread and slippage.

#### CAS-054 — Constraint solver and infeasibility

- **Build:** Produce a valid target range under mandate constraints or explicitly return `NO_FEASIBLE_ALLOCATION`.
- **Acceptance:** The engine never silently relaxes cash, drawdown, concentration or allowed-asset constraints.

#### CAS-055 — Recommendation explanation

- **Build:** Explain current versus target range, dominant drivers, binding constraints, scenario risk, invalidators and required human action.
- **Acceptance:** Every sentence is traceable to structured stored facts; no generated prose can alter the recommendation.

#### CAS-056 — Shock and freeze controls

- **Build:** Add stale-data, provider-discrepancy, thesis-invalidation, operational-outage and extreme-market freezes.
- **Acceptance:** A freeze permits risk reduction but prevents automatic exposure increases and is prominent in dashboard and alerts.

---

### Epic 6 — Paper portfolio, validation and attribution (release gate)

#### CAS-060 — Preregistered allocation protocol

- **Build:** Freeze eligible assets, signals, valuation methods, policy, rebalance schedule, benchmarks, fees, slippage and kill criteria before the forward test.
- **Acceptance:** Protocol changes start a new cohort/version; old results remain intact.

#### CAS-061 — Point-in-time simulation engine

- **Build:** Simulate deposits, recommendations, human approvals, fills, fees, slippage, cash return and rebalancing without look-ahead.
- **Acceptance:** Same inputs reproduce identical positions and NAV; unavailable-at-the-time observations are mechanically excluded.

#### CAS-062 — Prospective shadow portfolio

- **Build:** Run daily recommendations and scheduled paper rebalances for at least 6–12 months.
- **Acceptance:** Missed runs, manual overrides and data incidents remain visible and count against operational evidence.

#### CAS-063 — Performance and risk analytics

- **Build:** Report time- and money-weighted return, volatility, Sharpe/Sortino with caveats, max drawdown, recovery time, turnover and downside capture.
- **Acceptance:** Results use identical windows and cash-flow treatment across all benchmarks.

#### CAS-064 — Decision and performance attribution

- **Build:** Attribute outcomes to strategic allocation, tactical regime, valuation, asset selection, human override, costs and cash drag.
- **Acceptance:** The app can explain why it out- or underperformed rather than showing only aggregate return.

#### CAS-065 — Calibration and false-positive analysis

- **Build:** Measure reliability by regime/state/horizon, transition whipsaws, adverse excursion, probability calibration and factor redundancy.
- **Acceptance:** Use non-overlapping and walk-forward samples; report sample size prominently and prohibit promotion on insufficient evidence.

#### CAS-066 — Capital-readiness gate

- **Required evidence:** V1 trust gates passed; at least 90 operational days at >=99% successful cycles; 6–12 months prospective paper evidence; zero unresolved critical integrity defects; acceptable benchmark-relative drawdown and turnover; reviewed compliance boundary.
- **Acceptance:** Promotion is a documented human decision. Passing the gate enables a `LIVE_DECISION_SUPPORT` label, not order execution.

---

### Epic 7 — Capital allocation dashboard (P1/P2)

#### CAS-070 — Allocation cockpit

- **Build:** Show current weights, target ranges, cash, opportunity, stress, valuation, risk capacity, change since prior recommendation and pending approval.
- **Acceptance:** A user can understand “why this range, why now, what changes it” without opening raw tables.

#### CAS-071 — Asset decision packet

- **Build:** One page per asset covering regime, fundamentals, fair-value range, flows/positioning, scenarios, thesis, invalidators and allocation impact.
- **Acceptance:** Each headline links to source observations and methodology.

#### CAS-072 — Portfolio scenario lab

- **Build:** Preview the effect of allocation changes under bull/base/bear and historical stress scenarios.
- **Acceptance:** Scenario previews are clearly hypothetical, never overwrite recommendations and include liquidity/cost effects.

#### CAS-073 — Evidence and trust panel

- **Build:** Expose source health, model evidence, sample size, last validation, methodology changes and active warnings next to recommendations.
- **Acceptance:** No allocation output can appear without its trust context.

#### CAS-074 — Review queue and alerts

- **Build:** Prioritize mandate breach, target-band drift, thesis invalidation, material valuation change, data freeze and scheduled review.
- **Acceptance:** Alerts request review; they do not imply order execution.

---

### Epic 8 — Later expansion (P2, after BTC/ETH proof)

#### CAS-080 — Additional asset admission framework

- **Build:** Require minimum liquidity, custody, data history, source coverage, fundamental model and exit capacity before an asset enters the investable universe.
- **Acceptance:** No asset is added merely because price data exists.

#### CAS-081 — L1/protocol relative-value framework

- **Build:** Compare economic activity, retention, developer traction, capital flows, token incentives, security cost, dilution and value accrual.
- **Acceptance:** Network usage and token-holder economics remain separate dimensions.

#### CAS-082 — Read-only broker/exchange reconciliation

- **Build:** Import balances and fills using least-privilege read-only credentials.
- **Acceptance:** Credentials cannot trade or withdraw; manual ledger remains available and reconciliation differences are explicit.

#### CAS-083 — Execution subsystem decision

- **Status:** Explicitly out of scope for Capital Allocation V1.
- **Required before consideration:** Separate authorization, compliance review, threat model, key management, approvals, limits, idempotency, reconciliation, kill switch and incident response.

### Suggested release slices

1. **CAS Foundation:** CAS-001 through CAS-014 — correct semantics, governance, mandate and portfolio truth.
2. **Investment Intelligence:** CAS-020 through CAS-044 — valuation, fundamentals, flows, thesis and scenarios.
3. **Allocation Engine:** CAS-050 through CAS-056 — deterministic target ranges and hard risk constraints.
4. **Proof:** CAS-060 through CAS-066 — preregistered paper portfolio, attribution and capital-readiness review.
5. **Investor Experience:** CAS-070 through CAS-074 — allocation cockpit and decision packets, developed alongside slices 2–4 but released only with their evidence labels.

### Immediate next sprint

- [x] CAS-001: remove/replace any UI-level overall score that mixes opportunity and stress.
- [ ] CAS-002: domain contract is complete; implement persistence after its referenced entities exist.
- [x] CAS-004: shadow allocation scope reconciled with `instructions.md`; pre-release compliance review remains gated.
- [x] CAS-010: immutable BTC/ETH/cash mandate schema and authenticated workflow deployed.
- [x] CAS-013: benchmark definitions frozen; implement `DGS3MO` before cash-return evaluation.
- [ ] CAS-020/CAS-022 discovery: produce a free-first data-source matrix with licensing, history, freshness and fallback analysis.
- [ ] CAS-060 draft: preregister evaluation metrics and kill criteria before optimizing the allocation policy.
