# V1.0 validation roadmap

V1.0 means a trustworthy personal shadow-investment research product. It does not mean a proven trading strategy or automated portfolio advice.

Six gates remain from the start of validation-and-trust:

1. **Reconstructed replay** — implemented. Daily historical decisions, outcomes, adverse excursion, whipsaws and buy-and-hold/200DMA comparisons expose short samples and revision limitations. Evidence remains `UNVALIDATED`.
2. **Point-in-time integrity** — audit infrastructure is implemented. The gate remains blocked by missing DXY and the incomplete 90-day prospective window. Historical backfills remain `RECONSTRUCTED`.
3. **Automated operations** — scheduled ingestion → derivation → regime → decision → alerts → trust capture is implemented with bounded provider retries, resumable stages, heartbeat and provider-budget policies. The first complete cycle passed on 2026-08-22. Acceptance remains blocked until 30 operational days at ≥99% success are observed.
4. **Validation analytics and governance** — 30/90/180/365-day outcomes, adverse excursion, transitions and baseline comparisons are recorded. `v1-shadow-protocol.1` is frozen and analytics report calendar-based non-overlapping samples. Acceptance remains blocked: the reconstructed window has only 0–4 independent samples per asset/state/horizon versus 30 required.
5. **Investor workflow** — authenticated route `/journal` separates human action, thesis, invalidating evidence and review date from its immutable model snapshot. The validation page exposes Gate 3–6 status. Acceptance requires real journal use; an empty journal deliberately blocks the gate. Trend charts and threshold-distance ergonomics remain follow-up improvements, not grounds to weaken the protocol.
6. **Ninety-day shadow release gate** — `npm run v1:assess` persists a reproducible Gate 1–6 report without promoting the model. Acceptance remains time-blocked until 90 distinct shadow days exist, all earlier gates pass and unresolved critical trust defects remain zero. The model stays `UNVALIDATED` in the meantime.

## Operating commands

- `npm run shadow:cycle` runs or safely resumes one daily pipeline cycle.
- `npm run validation:replay` refreshes reconstructed validation and independent-sample metrics.
- `npm run v1:assess` records the current release-gate evidence.
- `.github/workflows/shadow-cycle.yml` schedules the cycle daily after the repository secrets named in that workflow are configured.

V0.2 indicators are not a V1.0 prerequisite. New factors remain blocked until the six gates show that the existing system can be operated and evaluated reliably.

## Monthly operator routine

1. Check **Vandaag** and resolve critical data or source incidents before reviewing allocation changes.
2. Record every human decision with a factual rationale; MODIFY uses mandate-validated target bands.
3. Inspect paper fills and their immutable audit trail. Never repair history manually—record incidents and rerun idempotently.
4. Run `npm run outcomes:calculate` and `npm run validation:monthly-report` after month-end.
5. Review sample sizes, benchmark-relative outcomes, adverse excursion and human overrides in **Beslissingskwaliteit**.
6. Record methodology changes as new versions. Do not tune the active protocol in response to a small sample.
7. Run `npm run capital:assess`; a blocked result is expected until the prospective time and reliability gates pass.

Negative returns are reported descriptively and are not automatically labelled false positives. That classification requires an explicit directional recommendation taxonomy and remains null until such a methodology is reviewed.
