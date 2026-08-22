begin;

-- The application has not entered production. Reset derived intelligence so no
-- v2 decision can be mistaken for a v3 four-layer decision. Raw and canonical
-- observations remain intact because they are reproducible input evidence.
truncate table public.alerts, public.decision_snapshots, public.regime_snapshots,
  public.indicator_snapshots restart identity;

drop view if exists public.decision_experience;

alter table public.indicators
  add column factor_family text,
  add column factor_classification text,
  add column classification_status text not null default 'HYPOTHESIS',
  add column canonical_source text,
  add column fallback_source text,
  add column validation_source text,
  add constraint indicators_factor_family_check check (
    factor_family is null or factor_family in (
      'GLOBAL_LIQUIDITY', 'US_LIQUIDITY', 'RATES_AND_DOLLAR',
      'STABLECOIN_LIQUIDITY', 'ONCHAIN_CREDIT', 'INSTITUTIONAL_FLOWS',
      'CAPITAL_MARKET_DEMAND', 'DERIVATIVES_LEVERAGE', 'MARKET_DEPTH',
      'ONCHAIN_VALUATION', 'CAPITULATION', 'ASSET_TREND'
    )
  ),
  add constraint indicators_factor_classification_check check (
    factor_classification is null or factor_classification in ('LEADING', 'CONFIRMING', 'RISK', 'CONTEXT')
  ),
  add constraint indicators_classification_status_check check (
    classification_status in ('HYPOTHESIS', 'VALIDATED')
  );

alter table public.regime_snapshots drop constraint regime_snapshots_regime_type_check;
alter table public.regime_snapshots drop constraint regime_snapshots_check;
alter table public.regime_snapshots
  add constraint regime_snapshots_regime_type_check check (
    regime_type in ('MACRO_LIQUIDITY', 'CRYPTO_CREDIT_LIQUIDITY', 'MARKET_STRUCTURE', 'ASSET')
  ),
  add constraint regime_snapshots_asset_ownership_check check (
    (regime_type = 'ASSET' and asset_id is not null)
    or (regime_type <> 'ASSET' and asset_id is null)
  );

alter table public.decision_snapshots
  add column market_structure_snapshot_id uuid not null references public.regime_snapshots(id);

insert into public.engine_versions (version, configuration, description, activated_at)
values (
  '0.5.0-hypothesis.1',
  '{"model":"v3","layers":["MACRO_LIQUIDITY","CRYPTO_CREDIT_LIQUIDITY","MARKET_STRUCTURE","ASSET"],"decisionEngineActive":false,"alertsActive":false,"assumptionStatus":"HYPOTHESIS"}',
  'V3 model foundation. Four-layer contracts are active; regime and decision calculations remain inactive until their phase gates pass.',
  null
)
on conflict (version) do nothing;

create or replace view public.decision_experience with (security_invoker = true) as
select d.id, d.calculated_at, a.symbol, a.name as asset_name, d.decision_state, d.previous_state,
       d.candidate_state, d.confidence_level, d.engine_version, d.explanation_facts, d.transition_reason,
       m.regime_state as macro_state, m.regime_score as macro_score, m.factor_breakdown as macro_factors,
       c.regime_state as crypto_state, c.regime_score as crypto_score, c.factor_breakdown as crypto_factors,
       ms.regime_state as market_structure_state, ms.regime_score as market_structure_score,
       ms.factor_breakdown as market_structure_factors,
       ar.regime_state as asset_state, ar.regime_score as asset_score, ar.factor_breakdown as asset_factors
from public.decision_snapshots d
join public.assets a on a.id = d.asset_id
join public.regime_snapshots m on m.id = d.macro_regime_snapshot_id
join public.regime_snapshots c on c.id = d.crypto_regime_snapshot_id
join public.regime_snapshots ms on ms.id = d.market_structure_snapshot_id
join public.regime_snapshots ar on ar.id = d.asset_regime_snapshot_id;

grant select on public.decision_experience to authenticated;

commit;
