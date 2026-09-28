-- Engine correctness fixes (change-controlled; see signal-model.md changelog).
--
-- Regime Engine 0.5.2: the "drawdown from one-year high" factor measured the
--   high over the last 365 observations. Once intraday prices accumulate that
--   window shrinks to weeks; it now uses 365 daily closes.
-- Decision Engine 0.6.3: Market Structure caps applied only to new
--   candidates. A state held by hysteresis or pending confirmation could stay
--   above the cap (e.g. STRONG_ACCUMULATION during CAPITULATION). The cap now
--   applies immediately to the held state (transition_reason
--   STRESS_CAP_APPLIED).
-- Alert Engine 0.7.1: a persisting risk override raised a CRITICAL alert on
--   every evaluation; only a newly activated override is now material.
begin;

insert into public.engine_versions(version,configuration,description,activated_at) values
  ('0.5.2-hypothesis.1',
   '{"model":"v3","regimeEngineActive":true,"assumptionStatus":"HYPOTHESIS","previousVersion":"0.5.1-hypothesis.1","change":"ASSET_DRAWDOWN_USES_365_DAILY_CLOSES","dollarStrength":{"factor":"DOLLAR_STRENGTH_ECB_90D","source":"DXY_PROXY_ECB","windowDays":90,"maximumAbsoluteScore":1,"officialDxy":false},"minimumFamilies":{"macro":2,"cryptoCredit":2,"marketStructure":2,"asset":1}}',
   'Asset drawdown from the one-year high is measured over 365 daily closes instead of 365 observations.',
   now()),
  ('0.6.3-hypothesis.1',
   '{"model":"v3","regimeEngineVersion":"0.5.2-hypothesis.1","previousVersion":"0.6.2-hypothesis.1","decisionEngineActive":true,"matrixCombinations":625,"persistenceObservations":2,"hysteresisActive":true,"stressCeilingAppliesToHeldState":true,"assumptionStatus":"HYPOTHESIS"}',
   'Market Structure caps also lower a state held by hysteresis or pending confirmation, immediately.',
   now()),
  ('0.7.1-hypothesis.1',
   '{"model":"v3","alertEngineActive":true,"previousVersion":"0.7.0-hypothesis.1","decisionEngineVersion":"0.6.3-hypothesis.1","historicalAlerts":false,"defaultCooldownHours":24,"materialOverride":"NEWLY_ACTIVATED_ONLY","channels":["IN_APP","EMAIL"],"emailProvider":"RESEND","assumptionStatus":"HYPOTHESIS"}',
   'A persisting risk override no longer re-alerts; only a newly activated override is material.',
   now())
on conflict(version) do nothing;

-- Snapshots before this watermark were classified by 0.7.0. Re-classifying
-- them could mint new fingerprints for old events, so live evaluation restarts
-- here, exactly as the original activation did.
update public.alert_engine_state
set live_since = now(), engine_version = '0.7.1-hypothesis.1', updated_at = now()
where id;

commit;
