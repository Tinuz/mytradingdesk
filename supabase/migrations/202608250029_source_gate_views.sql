begin;
create view public.source_governance_latest with(security_invoker=true)as select distinct on(provider_id)id,provider_id,version,approval_status,automation_rights,historical_storage_rights,source_url,terms_url,rate_limit,freshness_contract,fallback_policy,reviewed_at,notes,created_at from public.source_governance order by provider_id,created_at desc;
create view public.allocation_source_gate with(security_invoker=true)as
select i.code,p.name provider,coalesce(g.approval_status,'REVIEW_REQUIRED')approval_status,coalesce(g.automation_rights,'UNKNOWN')automation_rights,coalesce(g.historical_storage_rights,'UNKNOWN')historical_storage_rights,c.observed_at
from public.indicators i left join lateral(select canonical_provider_id,observed_at from public.canonical_observations x where x.indicator_id=i.id and x.quality_status='VALID'order by observed_at desc limit 1)c on true left join public.providers p on p.id=c.canonical_provider_id left join public.source_governance_latest g on g.provider_id=p.id
where i.code in('BTC_USD','ETH_USD','EUR_USD','US10Y_REAL','US_NET_LIQUIDITY_USD','GLOBAL_LIQUIDITY_USD','DXY_PROXY_ECB','STABLECOIN_SUPPLY_USD','BTC_ETF_NET_FLOW_USD','ETH_ETF_NET_FLOW_USD','DEFI_ACTIVE_LOANS_USD','BTC_MVRV','BTC_PERPETUAL_OI_USD','BTC_REALIZED_LOSSES_USD','US_3M_TBILL_YIELD');
grant select on public.source_governance_latest,public.allocation_source_gate to authenticated;
commit;
