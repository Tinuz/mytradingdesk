begin;
alter table public.decision_snapshots add column risk_override text not null default 'NONE'
  check(risk_override in('NONE','OVERHEAT_CAP','STRESS_CAP','CAPITULATION_CAP'));
insert into public.engine_versions(version,configuration,description,activated_at)values(
 '0.6.0-hypothesis.1',
 '{"model":"v3","phase":6,"regimeEngineVersion":"0.5.0-hypothesis.2","decisionEngineActive":true,"alertsActive":false,"matrixCombinations":625,"persistenceObservations":2,"hysteresisActive":true,"riskOverrides":["OVERHEAT_CAP","STRESS_CAP","CAPITULATION_CAP"],"assumptionStatus":"HYPOTHESIS"}',
 'Four-input deterministic Decision Engine with market-structure risk caps, hysteresis, persistence, confidence and explanations.',now())
on conflict(version)do nothing;
drop view if exists public.decision_experience;
create or replace view public.decision_experience with(security_invoker=true)as
select d.id,d.calculated_at,a.symbol,a.name as asset_name,d.decision_state,d.previous_state,d.candidate_state,d.confidence_level,d.engine_version,d.explanation_facts,d.transition_reason,d.risk_override,
 m.regime_state as macro_state,m.regime_score as macro_score,m.factor_breakdown as macro_factors,
 c.regime_state as crypto_state,c.regime_score as crypto_score,c.factor_breakdown as crypto_factors,
 ms.regime_state as market_structure_state,ms.regime_score as market_structure_score,ms.factor_breakdown as market_structure_factors,
 ar.regime_state as asset_state,ar.regime_score as asset_score,ar.factor_breakdown as asset_factors
from public.decision_snapshots d join public.assets a on a.id=d.asset_id join public.regime_snapshots m on m.id=d.macro_regime_snapshot_id join public.regime_snapshots c on c.id=d.crypto_regime_snapshot_id join public.regime_snapshots ms on ms.id=d.market_structure_snapshot_id join public.regime_snapshots ar on ar.id=d.asset_regime_snapshot_id;
grant select on public.decision_experience to authenticated;
commit;
