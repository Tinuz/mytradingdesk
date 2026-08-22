begin;

alter table public.raw_observations
  add column published_at timestamptz,
  add column revision_at timestamptz,
  add column unit text not null default 'unknown',
  add column quality_status public.observation_quality not null default 'REJECTED',
  add column validation_reasons jsonb not null default '[]'::jsonb;

alter table public.canonical_observations
  add column source_observation_id uuid references public.raw_observations(id),
  add column unit text not null default 'unknown';

alter table public.canonical_observations
  drop constraint canonical_observations_indicator_id_observed_at_canonical_p_key;

create unique index canonical_observations_source_unique
  on public.canonical_observations(source_observation_id)
  where source_observation_id is not null;

create or replace function public.prevent_observation_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is immutable; append a revision instead', tg_table_name;
end;
$$;

create trigger raw_observations_immutable
before update or delete on public.raw_observations
for each row execute function public.prevent_observation_mutation();

create trigger canonical_observations_immutable
before update or delete on public.canonical_observations
for each row execute function public.prevent_observation_mutation();

insert into public.providers (name, priority, supports_backfill)
values
  ('coingecko', 1, true),
  ('twelve-data', 2, true),
  ('fred', 1, true)
on conflict (name) do update set priority = excluded.priority, supports_backfill = excluded.supports_backfill;

insert into public.indicators (code, name, category, unit, expected_frequency, stale_after_seconds, data_contract)
values
  ('BTC_USD', 'Bitcoin price in US dollars', 'asset_price', 'usd', interval '15 minutes', 1800,
   '{"minimum":100,"maximum":2000000,"maxPlausibleChangePercent":35,"canonicalProvider":"coingecko","fallbackProvider":"twelve-data","reconciliationTolerancePercent":1,"assumptionStatus":"HYPOTHESIS"}'),
  ('ETH_USD', 'Ethereum price in US dollars', 'asset_price', 'usd', interval '15 minutes', 1800,
   '{"minimum":1,"maximum":200000,"maxPlausibleChangePercent":40,"canonicalProvider":"coingecko","fallbackProvider":"twelve-data","reconciliationTolerancePercent":1,"assumptionStatus":"HYPOTHESIS"}'),
  ('DXY', 'US Dollar Index', 'macro', 'index_points', interval '1 hour', 14400,
   '{"minimum":50,"maximum":200,"maxPlausibleChangePercent":10,"canonicalProvider":"ice-data-api","reconciliationTolerancePercent":0.5,"assumptionStatus":"HYPOTHESIS","activationStatus":"BLOCKED_MISSING_LICENSE"}'),
  ('US10Y_REAL', 'US 10-year real yield', 'macro', 'percent', interval '1 day', 345600,
   '{"minimum":-10,"maximum":20,"maxPlausibleChangePercent":100,"canonicalProvider":"fred","series":"DFII10","reconciliationTolerancePercent":5,"assumptionStatus":"HYPOTHESIS"}')
on conflict (code) do nothing;

commit;
