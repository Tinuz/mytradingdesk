begin;
create table public.model_runs(
 id uuid primary key default gen_random_uuid(),run_type text not null,run_mode text not null check(run_mode in('LIVE','HISTORICAL','SHADOW')),
 status text not null check(status in('RUNNING','SUCCEEDED','FAILED','BLOCKED')),started_at timestamptz not null,completed_at timestamptz,
 engine_version text,calculation_at timestamptz,records_evaluated integer not null default 0,error text,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now());
create index model_runs_recent on public.model_runs(run_type,started_at desc);
alter table public.model_runs enable row level security;
create policy "authenticated users read model runs" on public.model_runs for select to authenticated using(true);

create table public.trust_observations(
 id uuid primary key default gen_random_uuid(),captured_at timestamptz not null,observation_date date not null,
 model_validation_status text not null default 'UNVALIDATED' check(model_validation_status in('UNVALIDATED','SHADOW','VALIDATED')),
 fresh_indicators integer not null,stale_indicators integer not null,missing_indicators integer not null,open_quality_events integer not null,
 decision_snapshots integer not null,decision_transitions integer not null,alert_count integer not null,
 latest_decision_at timestamptz,pipeline_delay_seconds integer,details jsonb not null default '{}'::jsonb,
 unique(observation_date));
alter table public.trust_observations enable row level security;
create policy "authenticated users read trust observations" on public.trust_observations for select to authenticated using(true);

drop view if exists public.indicator_health;
create view public.indicator_health with(security_invoker=true)as
select i.code,i.name,i.category,i.unit,i.expected_frequency,i.stale_after_seconds,x.observed_at,x.value,x.quality_status,x.provider,x.source_type,
 case when x.observed_at is null then 'MISSING' when x.quality_status<>'VALID' then x.quality_status
      when now()-x.observed_at>make_interval(secs=>i.stale_after_seconds)then 'STALE' else 'FRESH' end freshness
from public.indicators i left join lateral(
 select observed_at,value,quality_status,provider,source_type from(
  select c.observed_at,c.value,c.quality_status::text quality_status,p.name provider,'CANONICAL'::text source_type
  from public.canonical_observations c left join public.providers p on p.id=c.canonical_provider_id where c.indicator_id=i.id
  union all
  select s.calculated_at,s.raw_value,'VALID'::text,s.calculation_version,'DERIVED'::text
  from public.indicator_snapshots s where s.indicator_id=i.id and s.raw_value is not null)observations
 order by observed_at desc limit 1)x on true;

drop view if exists public.decision_experience;
create view public.decision_experience with(security_invoker=true)as
select d.id,d.calculated_at,a.symbol,a.name asset_name,d.decision_state,d.previous_state,d.candidate_state,d.confidence_level,d.engine_version,d.explanation_facts,d.transition_reason,d.risk_override,
 m.regime_state macro_state,m.regime_score macro_score,m.factor_breakdown macro_factors,c.regime_state crypto_state,c.regime_score crypto_score,c.factor_breakdown crypto_factors,
 ms.regime_state market_structure_state,ms.regime_score market_structure_score,ms.factor_breakdown market_structure_factors,ar.regime_state asset_state,ar.regime_score asset_score,ar.factor_breakdown asset_factors,
 'UNVALIDATED'::text model_validation_status,case when now()-d.calculated_at>interval '30 minutes'then 'STALE' else 'CURRENT'end snapshot_freshness
from public.decision_snapshots d join public.assets a on a.id=d.asset_id join public.regime_snapshots m on m.id=d.macro_regime_snapshot_id join public.regime_snapshots c on c.id=d.crypto_regime_snapshot_id join public.regime_snapshots ms on ms.id=d.market_structure_snapshot_id join public.regime_snapshots ar on ar.id=d.asset_regime_snapshot_id;
grant select on public.indicator_health,public.decision_experience to authenticated;

create or replace view public.trust_status with(security_invoker=true)as
select 'UNVALIDATED'::text model_validation_status,
 count(*)filter(where freshness='FRESH')::integer fresh_indicators,count(*)filter(where freshness='STALE')::integer stale_indicators,
 count(*)filter(where freshness='MISSING')::integer missing_indicators,(select count(*)::integer from public.data_quality_events where resolved_at is null)open_quality_events,
 (select max(calculated_at)from public.decision_snapshots)latest_decision_at,
 case when(select max(calculated_at)from public.decision_snapshots)is null then 'MISSING'
      when now()-(select max(calculated_at)from public.decision_snapshots)>interval '30 minutes'then 'STALE' else 'CURRENT'end decision_freshness
from public.indicator_health;
grant select on public.trust_status to authenticated;
commit;
