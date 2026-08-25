begin;

create table public.investor_mandates(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id)on delete cascade,
 version text not null,
 base_currency text not null check(base_currency in('EUR','USD')),
 objective text not null check(objective in('CAPITAL_PRESERVATION','BALANCED','GROWTH')),
 horizon_months integer not null check(horizon_months between 3 and 240),
 maximum_drawdown_percent numeric not null check(maximum_drawdown_percent between 1 and 80),
 minimum_cash_percent numeric not null check(minimum_cash_percent between 0 and 100),
 maximum_asset_weight_percent numeric not null check(maximum_asset_weight_percent between 1 and 100),
 annual_turnover_budget_percent numeric not null check(annual_turnover_budget_percent between 0 and 2000),
 rebalance_cadence text not null check(rebalance_cadence in('WEEKLY','MONTHLY','QUARTERLY')),
 allowed_assets text[] not null default array['BTC','ETH']::text[],
 evidence_status text not null default 'SHADOW' check(evidence_status='SHADOW'),
 effective_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(user_id,version),
 check(allowed_assets<@array['BTC','ETH']::text[] and cardinality(allowed_assets)>0),
 check(minimum_cash_percent+maximum_asset_weight_percent<=100)
);
comment on table public.investor_mandates is 'Append-only, user-owned SHADOW allocation mandate versions.';
alter table public.investor_mandates enable row level security;
create policy "users read own mandates" on public.investor_mandates for select to authenticated using((select auth.uid())=user_id);
create policy "users append own mandates" on public.investor_mandates for insert to authenticated with check((select auth.uid())=user_id);
create trigger investor_mandates_immutable before update or delete on public.investor_mandates for each row execute function public.prevent_observation_mutation();

create table public.benchmark_definitions(
 id uuid primary key default gen_random_uuid(),code text not null,version text not null,status text not null check(status in('FROZEN','RETIRED')),
 definition jsonb not null,frozen_at timestamptz not null,notes text not null,unique(code,version)
);
alter table public.benchmark_definitions enable row level security;
create policy "authenticated users read benchmarks" on public.benchmark_definitions for select to authenticated using(true);
create trigger benchmark_definitions_immutable before update or delete on public.benchmark_definitions for each row execute function public.prevent_observation_mutation();

insert into public.benchmark_definitions(code,version,status,definition,frozen_at,notes)values
('BTC_HOLD','benchmark-v1','FROZEN','{"assets":{"BTC":1},"initialRebalanceOnly":true,"priceSeries":"BTC_USD","feesBps":0,"cashReturnSeries":null,"missingData":"NO_VALUATION"}',now(),'Pure BTC buy-and-hold baseline; intentionally excludes costs after initial allocation.'),
('BTC_CASH_50_50','benchmark-v1','FROZEN','{"assets":{"BTC":0.5,"CASH":0.5},"rebalance":"MONTHLY_LAST_AVAILABLE_UTC_CLOSE","priceSeries":{"BTC":"BTC_USD"},"cashReturnSeries":"DGS3MO","feesBps":10,"missingData":"NO_REBALANCE"}',now(),'Balanced crypto/cash baseline. DGS3MO ingestion is required before performance activation.'),
('BTC_ETH_60_40','benchmark-v1','FROZEN','{"assets":{"BTC":0.6,"ETH":0.4},"rebalance":"MONTHLY_LAST_AVAILABLE_UTC_CLOSE","priceSeries":{"BTC":"BTC_USD","ETH":"ETH_USD"},"feesBps":10,"missingData":"NO_REBALANCE"}',now(),'Static BTC/ETH allocation baseline with explicit monthly rebalancing and costs.'),
('BTC_200DMA','benchmark-v1','FROZEN','{"riskAsset":"BTC","riskWeightWhenAbove":1,"riskWeightWhenBelow":0,"signal":"PRIOR_UTC_CLOSE_VS_200DMA","execution":"NEXT_AVAILABLE_UTC_CLOSE","priceSeries":"BTC_USD","cashReturnSeries":"DGS3MO","feesBps":10,"minimumHistoryDays":200,"missingData":"HOLD_PREVIOUS_WEIGHT"}',now(),'Trend baseline with one-day signal/execution separation. DGS3MO is required before performance activation.');

create view public.current_investor_mandate with(security_invoker=true)as
select distinct on(user_id)id,user_id,version,base_currency,objective,horizon_months,maximum_drawdown_percent,minimum_cash_percent,maximum_asset_weight_percent,annual_turnover_budget_percent,rebalance_cadence,allowed_assets,evidence_status,effective_at,created_at
from public.investor_mandates order by user_id,effective_at desc,created_at desc;
grant select on public.current_investor_mandate to authenticated;

commit;
