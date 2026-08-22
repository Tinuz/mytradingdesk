begin;
create table public.data_availability_policies(
 indicator_id uuid primary key references public.indicators(id),availability_basis text not null check(availability_basis in('RECEIVED_AT','CALCULATED_AT')),
 minimum_history integer not null check(minimum_history>0),vintage_support boolean not null default false,policy_version text not null,notes text not null,created_at timestamptz not null default now());
insert into public.data_availability_policies(indicator_id,availability_basis,minimum_history,vintage_support,policy_version,notes)
select id,case when code in('STABLECOIN_GROWTH_30D_PERCENT','STABLECOIN_GROWTH_90D_PERCENT','STABLECOIN_GROWTH_ACCELERATION_PP','BTC_ETF_FLOW_20D_USD','ETH_ETF_FLOW_20D_USD','DEFI_LOANS_GROWTH_30D_PERCENT','BTC_OI_MARKET_CAP_RATIO','BTC_OI_DRAWDOWN_FROM_HIGH_PERCENT')then'CALCULATED_AT'else'RECEIVED_AT'end,
case when code in('BTC_USD','ETH_USD')then 200 when code='GLOBAL_LIQUIDITY_USD'then 4 when code='US_NET_LIQUIDITY_USD'then 14 when code in('DXY','US10Y_REAL')then 31 when code='BTC_PERPETUAL_OI_USD'then 90 else 1 end,
false,'availability-v1','Only persisted receipt/calculation time is accepted as proof. Observation date alone is never availability proof.' from public.indicators;
alter table public.data_availability_policies enable row level security;
create policy "authenticated users read availability policies" on public.data_availability_policies for select to authenticated using(true);

create table public.point_in_time_audits(
 id uuid primary key default gen_random_uuid(),status text not null check(status in('RUNNING','PASSED','BLOCKED','FAILED')),started_at timestamptz not null,completed_at timestamptz,
 policy_version text not null,required_indicators integer not null default 0,passed_indicators integer not null default 0,
 total_observations integer not null default 0,late_observations integer not null default 0,missing_availability integer not null default 0,
 blockers jsonb not null default '[]'::jsonb,summary jsonb not null default '{}'::jsonb,error text,created_at timestamptz not null default now());
alter table public.point_in_time_audits enable row level security;
create policy "authenticated users read point in time audits" on public.point_in_time_audits for select to authenticated using(true);

create table public.point_in_time_indicator_results(
 id uuid primary key default gen_random_uuid(),audit_id uuid not null references public.point_in_time_audits(id)on delete cascade,indicator_id uuid not null references public.indicators(id),
 availability_basis text not null,minimum_history integer not null,total_observations integer not null,proven_availability integer not null,same_day_available integer not null,
 late_observations integer not null,missing_availability integer not null,published_timestamps integer not null,revision_timestamps integer not null,
 first_observed_at timestamptz,last_observed_at timestamptz,first_available_at timestamptz,point_in_time_status text not null check(point_in_time_status in('PASSED','BLOCKED','MISSING')),
 blockers jsonb not null default '[]'::jsonb,unique(audit_id,indicator_id));
alter table public.point_in_time_indicator_results enable row level security;
create policy "authenticated users read point in time indicator results" on public.point_in_time_indicator_results for select to authenticated using(true);

create or replace view public.point_in_time_audit_latest with(security_invoker=true)as select a.* from public.point_in_time_audits a where a.status in('PASSED','BLOCKED')order by a.completed_at desc limit 1;
grant select on public.point_in_time_audit_latest to authenticated;
commit;
