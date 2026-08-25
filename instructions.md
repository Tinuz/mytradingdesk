# Engineering instructions

The product specification supplied for this repository is authoritative. Its central rules are:

- Work sequentially and pass each phase gate before starting the next phase.
- Optimize reliability, explainability, reproducibility, auditability, low false-alert frequency, and deterministic behavior.
- Keep macro, crypto-liquidity, and per-asset regimes separately observable.
- Never use `BUY` or `SELL` as the primary decision vocabulary.
- Never fabricate, silently interpolate, or silently switch market data.
- Preserve immutable raw history and version every material model behavior change.
- Keep core signal logic in `packages/signal-engine`, independent of frameworks, databases, and APIs.
- Limit V0.1 to BTC and ETH and the explicitly approved indicators.
- Classify unvalidated model assumptions as `HYPOTHESIS`.
- Treat data quality and freshness tests as financial-logic tests, not optional plumbing.
- Do not implement execution, leverage, sentiment scoring, or ML price prediction.
- Allocation functionality is limited to deterministic, versioned `SHADOW` decision support for BTC, ETH and cash. It must use user-owned mandates, target ranges, human approval and explicit evidence labels; it may not place orders or be presented as validated personalized advice until the capital-readiness gate passes.

## Change control

A model change must record the change, reason, expected effect, tests, and a new engine version before activation. A scope addition requires explicit approval or backlog placement.
