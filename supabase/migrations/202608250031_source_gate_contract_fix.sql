begin;
drop view public.allocation_source_gate;
drop view public.source_governance_latest;
create view public.source_governance_latest with(security_invoker=true) as
select distinct on(g.provider_id) g.id,g.provider_id,p.name provider_name,g.version,g.approval_status,g.automation_rights,g.historical_storage_rights,g.source_url,g.terms_url,g.rate_limit,g.freshness_contract,g.fallback_policy,g.reviewed_at,g.notes,g.created_at
from public.source_governance g join public.providers p on p.id=g.provider_id order by g.provider_id,g.created_at desc;
create view public.allocation_source_gate with(security_invoker=true) as
select i.code,p.name provider_name,coalesce(g.approval_status,'REVIEW_REQUIRED') approval_status,coalesce(g.automation_rights,'UNKNOWN') automation_rights,coalesce(g.historical_storage_rights,'UNKNOWN') historical_storage_rights,c.observed_at,
case when c.observed_at is null then 'MISSING' when now()-c.observed_at>make_interval(secs=>i.stale_after_seconds) then 'STALE' else 'CURRENT' end freshness,
(coalesce(g.approval_status,'REVIEW_REQUIRED')='APPROVED' and coalesce(g.automation_rights,'UNKNOWN')='ALLOWED' and coalesce(g.historical_storage_rights,'UNKNOWN')='ALLOWED' and c.observed_at is not null and now()-c.observed_at<=make_interval(secs=>i.stale_after_seconds)) allocation_approved
from public.indicators i left join lateral(select canonical_provider_id,observed_at from public.canonical_observations x where x.indicator_id=i.id and x.quality_status='VALID' order by observed_at desc limit 1)c on true left join public.providers p on p.id=c.canonical_provider_id left join public.source_governance_latest g on g.provider_id=p.id
where i.code in('BTC_USD','ETH_USD','EUR_USD','US10Y_REAL','US_NET_LIQUIDITY_USD','GLOBAL_LIQUIDITY_USD','DXY_PROXY_ECB','STABLECOIN_SUPPLY_USD','BTC_ETF_NET_FLOW_USD','ETH_ETF_NET_FLOW_USD','DEFI_ACTIVE_LOANS_USD','BTC_MVRV','BTC_PERPETUAL_OI_USD','BTC_REALIZED_LOSSES_USD','US_3M_TBILL_YIELD');
grant select on public.source_governance_latest,public.allocation_source_gate to authenticated;
commit;
