begin;

alter table public.decision_snapshots
  add column opportunity_state text
    check(opportunity_state is null or opportunity_state in('STRONG_ACCUMULATION','ACCUMULATION','NEUTRAL','RISK_REDUCTION','DEFENSIVE')),
  add column opportunity_score smallint
    check(opportunity_score is null or opportunity_score between -6 and 6),
  add column stress_state text
    check(stress_state is null or stress_state in('CAPITULATION','STRESSED','HEALTHY','ELEVATED_RISK','OVERHEATED')),
  add column stress_score smallint
    check(stress_score is null or stress_score between -2 and 2);

comment on column public.decision_snapshots.opportunity_state is
  'Pre-risk-governance opportunity classification derived only from macro, crypto credit and asset regimes.';
comment on column public.decision_snapshots.stress_state is
  'Independent Market Structure stress classification; never summed into opportunity.';

insert into public.engine_versions(version,configuration,description,activated_at)
values(
  '0.6.2-hypothesis.1',
  '{"model":"v3","regimeEngineVersion":"0.5.1-hypothesis.1","decisionEngineActive":true,"matrixCombinations":625,"opportunityInputs":["MACRO_LIQUIDITY","CRYPTO_CREDIT_LIQUIDITY","ASSET"],"stressInput":"MARKET_STRUCTURE","stressIsIndependent":true,"allocationAdviceActive":false,"assumptionStatus":"HYPOTHESIS"}',
  'Exposes and persists pre-governance opportunity separately from Market Structure stress. Decision matrix behavior is unchanged; allocation advice remains inactive.',
  now()
)
on conflict(version)do nothing;

drop view if exists public.decision_experience;
create view public.decision_experience with(security_invoker=true)as
select d.id,d.calculated_at,a.symbol,a.name asset_name,d.decision_state,d.previous_state,d.candidate_state,d.confidence_level,d.engine_version,d.explanation_facts,d.transition_reason,d.risk_override,
 d.opportunity_state,d.opportunity_score,d.stress_state,d.stress_score,
 m.regime_state macro_state,m.regime_score macro_score,m.factor_breakdown macro_factors,c.regime_state crypto_state,c.regime_score crypto_score,c.factor_breakdown crypto_factors,
 ms.regime_state market_structure_state,ms.regime_score market_structure_score,ms.factor_breakdown market_structure_factors,ar.regime_state asset_state,ar.regime_score asset_score,ar.factor_breakdown asset_factors,
 'UNVALIDATED'::text model_validation_status,case when now()-d.calculated_at>interval '30 minutes'then 'STALE' else 'CURRENT'end snapshot_freshness
from public.decision_snapshots d join public.assets a on a.id=d.asset_id join public.regime_snapshots m on m.id=d.macro_regime_snapshot_id join public.regime_snapshots c on c.id=d.crypto_regime_snapshot_id join public.regime_snapshots ms on ms.id=d.market_structure_snapshot_id join public.regime_snapshots ar on ar.id=d.asset_regime_snapshot_id;
grant select on public.decision_experience to authenticated;

commit;
