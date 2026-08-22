begin;

create or replace view public.decision_experience with (security_invoker = true) as
select d.id, d.calculated_at, a.symbol, a.name as asset_name, d.decision_state, d.previous_state,
       d.candidate_state, d.confidence_level, d.engine_version, d.explanation_facts, d.transition_reason,
       m.regime_state as macro_state, m.regime_score as macro_score, m.factor_breakdown as macro_factors,
       c.regime_state as crypto_state, c.regime_score as crypto_score, c.factor_breakdown as crypto_factors,
       ar.regime_state as asset_state, ar.regime_score as asset_score, ar.factor_breakdown as asset_factors
from public.decision_snapshots d
join public.assets a on a.id = d.asset_id
join public.regime_snapshots m on m.id = d.macro_regime_snapshot_id
join public.regime_snapshots c on c.id = d.crypto_regime_snapshot_id
join public.regime_snapshots ar on ar.id = d.asset_regime_snapshot_id;

create or replace view public.indicator_health with (security_invoker = true) as
select distinct on (i.id) i.code, i.name, i.category, i.unit, i.expected_frequency, i.stale_after_seconds,
       c.observed_at, c.value, c.quality_status, p.name as provider,
       case when c.observed_at is null then 'MISSING'
            when c.quality_status <> 'VALID' then c.quality_status::text
            when now() - c.observed_at > make_interval(secs => i.stale_after_seconds) then 'STALE'
            else 'FRESH' end as freshness
from public.indicators i
left join public.canonical_observations c on c.indicator_id = i.id
left join public.providers p on p.id = c.canonical_provider_id
order by i.id, c.observed_at desc;

grant select on public.decision_experience to authenticated;
grant select on public.indicator_health to authenticated;
create policy "authenticated users read ingestion runs" on public.ingestion_runs for select to authenticated using (true);
create policy "authenticated users read quality events" on public.data_quality_events for select to authenticated using (true);

commit;
