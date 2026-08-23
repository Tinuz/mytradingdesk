begin;

insert into public.providers(name,priority,supports_backfill) values
  ('ecb-dxy-proxy',1,true),
  ('fred-broad-dollar',1,true)
on conflict(name) do update set priority=excluded.priority,supports_backfill=excluded.supports_backfill;

insert into public.indicators(
  code,name,category,unit,expected_frequency,stale_after_seconds,data_contract,
  factor_family,factor_classification,classification_status,canonical_source
) values
  (
    'DXY_PROXY_ECB','ECB-derived US Dollar Index proxy','macro_validation','index_points',interval '1 day',345600,
    '{"minimum":50,"maximum":200,"maxPlausibleChangePercent":10,"canonicalProvider":"ecb-dxy-proxy","methodologyVersion":"ecb-dxy-proxy-v1","formula":"50.14348112*EURUSD^-0.576*USDJPY^0.136*GBPUSD^-0.119*USDCAD^0.091*USDSEK^0.042*USDCHF^0.036","fixing":"ECB daily reference rates","officialDxy":false,"activationStatus":"SHADOW_VALIDATION","limitations":["not the official ICE DXY close","ECB reference fixing differs from ICE intraday midpoint"]}',
    'RATES_AND_DOLLAR','CONTEXT','HYPOTHESIS','ECB derived proxy'
  ),
  (
    'US_BROAD_DOLLAR_INDEX','Federal Reserve Nominal Broad US Dollar Index','macro_validation','index_points',interval '1 day',345600,
    '{"minimum":50,"maximum":200,"maxPlausibleChangePercent":10,"canonicalProvider":"fred-broad-dollar","series":"DTWEXBGS","activationStatus":"SHADOW_VALIDATION","limitations":["broader trade-weighted basket","not an exact DXY substitute"]}',
    'RATES_AND_DOLLAR','CONTEXT','HYPOTHESIS','FRED'
  )
on conflict(code) do update set
  name=excluded.name,category=excluded.category,unit=excluded.unit,
  expected_frequency=excluded.expected_frequency,stale_after_seconds=excluded.stale_after_seconds,
  data_contract=excluded.data_contract,factor_family=excluded.factor_family,
  factor_classification=excluded.factor_classification,
  classification_status=excluded.classification_status,canonical_source=excluded.canonical_source;

insert into public.data_availability_policies(indicator_id,availability_basis,minimum_history,vintage_support,policy_version,notes)
select id,'RECEIVED_AT',31,false,'availability-v1','Shadow-validation input; never backdated into historical decisions.'
from public.indicators where code in('DXY_PROXY_ECB','US_BROAD_DOLLAR_INDEX')
on conflict(indicator_id) do update set minimum_history=excluded.minimum_history,notes=excluded.notes;

create or replace view public.dollar_strength_validation with(security_invoker=true) as
with series as (
  select c.observed_at::date observation_date,i.code,c.value::double precision value
  from public.canonical_observations c join public.indicators i on i.id=c.indicator_id
  where i.code in('DXY_PROXY_ECB','US_BROAD_DOLLAR_INDEX') and c.quality_status='VALID'
), paired as (
  select p.observation_date,p.value proxy_value,b.value broad_value
  from series p join series b using(observation_date)
  where p.code='DXY_PROXY_ECB' and b.code='US_BROAD_DOLLAR_INDEX'
), changes as (
  select current.*,
    100*(current.proxy_value/proxy_prior.proxy_value-1) proxy_change_30d_percent,
    100*(current.broad_value/broad_prior.broad_value-1) broad_change_30d_percent
  from paired current
  left join lateral(select value proxy_value from series where code='DXY_PROXY_ECB' and observation_date<=current.observation_date-30 order by observation_date desc limit 1)proxy_prior on true
  left join lateral(select value broad_value from series where code='US_BROAD_DOLLAR_INDEX' and observation_date<=current.observation_date-30 order by observation_date desc limit 1)broad_prior on true
)
select *,case
  when proxy_change_30d_percent is null or broad_change_30d_percent is null then null
  when sign(proxy_change_30d_percent)=sign(broad_change_30d_percent) then true else false
end direction_agreement_30d
from changes;

grant select on public.dollar_strength_validation to authenticated;

commit;
