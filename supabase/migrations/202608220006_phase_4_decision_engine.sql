begin;

insert into public.engine_versions (version, configuration, description, activated_at)
values (
  '0.4.0-hypothesis.1',
  '{"phase":4,"assumptionStatus":"HYPOTHESIS","decisionEngineActive":true,"persistenceObservations":2,"hysteresisActive":true,"confidenceLabels":["LOW","MEDIUM","HIGH"],"shockOverrides":["SYSTEMIC_STABLECOIN_FAILURE","MAJOR_EXCHANGE_INSOLVENCY","GOVERNMENT_PROHIBITION","EMERGENCY_CENTRAL_BANK_ACTION"],"alertsActive":false}',
  'Initial deterministic decision matrix, hysteresis, persistence, confidence and explanation facts; alerts remain inactive.',
  now()
)
on conflict (version) do nothing;

create unique index if not exists regime_snapshots_idempotency
  on public.regime_snapshots (regime_type, coalesce(asset_id, '00000000-0000-0000-0000-000000000000'::uuid), calculated_at, engine_version);
create unique index if not exists decision_snapshots_idempotency
  on public.decision_snapshots (asset_id, calculated_at, engine_version);

commit;
