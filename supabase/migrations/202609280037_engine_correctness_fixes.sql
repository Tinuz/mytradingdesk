-- Engine correctness fixes (change-controlled; see the signal-model.md
-- engine changelog for reason, expected effect and tests).
--
-- Regime Engine 0.5.2: asset drawdown uses the daily closes of the last 365
--   calendar days instead of the last 365 observations.
-- Decision Engine 0.6.3: after hysteresis and persistence, Market Structure
--   caps the emitted state, including a state held above the cap
--   (transition_reason STRESS_CAP_APPLIED).
-- Alert Engine 0.7.1: persisting or de-escalating overrides are not material;
--   entering either extreme market structure stays critical.
--
-- Deploy after a completed daily cycle: moving the alert watermark skips
-- snapshots that were not yet alerted.
begin;

insert into public.engine_versions(version,configuration,description,activated_at) values
  ('0.5.2-hypothesis.1',
   '{"model":"v3","regimeEngineActive":true,"assumptionStatus":"HYPOTHESIS","previousVersion":"0.5.1-hypothesis.1","dollarStrength":{"factor":"DOLLAR_STRENGTH_ECB_90D","source":"DXY_PROXY_ECB","windowDays":90,"supportiveAtOrBelowPercent":-2,"restrictiveAtOrAbovePercent":2,"maximumAbsoluteScore":1,"validationSeries":"US_BROAD_DOLLAR_INDEX","divergenceLowersConfidence":true,"officialDxy":false},"assetDrawdown":{"window":"DAILY_CLOSES_LAST_365_CALENDAR_DAYS","negativeAtOrBelowPercent":-20,"stronglyNegativeAtOrBelowPercent":-40},"minimumFamilies":{"macro":2,"cryptoCredit":2,"marketStructure":2,"asset":1}}',
   'Asset drawdown from the one-year high uses the daily closes of the last 365 calendar days instead of the last 365 observations.',
   now()),
  ('0.6.3-hypothesis.1',
   '{"model":"v3","regimeEngineVersion":"0.5.2-hypothesis.1","previousVersion":"0.6.2-hypothesis.1","decisionEngineActive":true,"matrixCombinations":625,"opportunityInputs":["MACRO_LIQUIDITY","CRYPTO_CREDIT_LIQUIDITY","ASSET"],"stressInput":"MARKET_STRUCTURE","stressIsIndependent":true,"persistenceObservations":2,"hysteresisActive":true,"stressCeiling":{"appliesAfterPersistence":true,"appliesToHeldState":true,"keepsPendingLowerCandidate":true,"ceilings":{"OVERHEATED":"ACCUMULATION","ELEVATED_RISK":"ACCUMULATION","STRESSED":"NEUTRAL","CAPITULATION":"NEUTRAL"}},"memoryCompatibleWith":["0.6.2-hypothesis.1","0.6.1-hypothesis.1"],"allocationAdviceActive":false,"assumptionStatus":"HYPOTHESIS"}',
   'Market Structure caps the emitted state after hysteresis and persistence, so a held state cannot stay above the cap. A pending downgrade keeps its confirmation count.',
   now()),
  ('0.7.1-hypothesis.1',
   '{"model":"v3","alertEngineActive":true,"previousVersion":"0.7.0-hypothesis.1","decisionEngineVersion":"0.6.3-hypothesis.1","historicalAlerts":false,"defaultCooldownHours":24,"materialOverride":"NEW_OR_ESCALATED_ONLY","critical":["OVERRIDE_ESCALATED","ENTERED_EXTREME_MARKET_STRUCTURE","DECISION_CHANGE_DURING_EXTREME_STRUCTURE"],"channels":["IN_APP","EMAIL"],"emailProvider":"RESEND","assumptionStatus":"HYPOTHESIS"}',
   'Persisting or de-escalating risk overrides no longer alert. Entering an extreme market structure or changing decision during one stays critical.',
   now())
on conflict(version) do nothing;

-- Snapshots before this watermark were classified by 0.7.0. Re-classifying
-- them could mint new fingerprints for old events, so live evaluation restarts
-- here, as the original activation did. Re-running the migration is a no-op.
update public.alert_engine_state
set live_since = now(), engine_version = '0.7.1-hypothesis.1', updated_at = now()
where id and engine_version <> '0.7.1-hypothesis.1';

commit;
