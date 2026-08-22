begin;
create table public.validation_replay_runs(
 id uuid primary key default gen_random_uuid(),replay_mode text not null check(replay_mode in('RECONSTRUCTED','POINT_IN_TIME')),
 status text not null check(status in('RUNNING','SUCCEEDED','FAILED')),started_at timestamptz not null,completed_at timestamptz,
 from_date date,to_date date,regime_engine_version text not null,decision_engine_version text not null,methodology_version text not null,
 evaluated_days integer not null default 0,available_decisions integer not null default 0,transition_count integer not null default 0,
 metrics jsonb not null default '{}'::jsonb,limitations jsonb not null default '[]'::jsonb,error text,created_at timestamptz not null default now());
create index validation_replay_runs_recent on public.validation_replay_runs(started_at desc);
alter table public.validation_replay_runs enable row level security;
create policy "authenticated users read validation replay runs" on public.validation_replay_runs for select to authenticated using(true);

create table public.validation_replay_points(
 id uuid primary key default gen_random_uuid(),replay_run_id uuid not null references public.validation_replay_runs(id)on delete cascade,
 evaluation_date date not null,asset_id uuid not null references public.assets(id),decision_state text not null,
 confidence_level public.confidence_level not null,transitioned boolean not null,transition_reason text not null,risk_override text not null,
 macro_state text not null,macro_score smallint not null,crypto_state text not null,crypto_score smallint not null,
 market_structure_state text not null,market_structure_score smallint not null,asset_state text not null,asset_score smallint not null,
 price numeric not null,dma_200 numeric,baseline_state text not null,forward_returns jsonb not null default '{}'::jsonb,
 adverse_excursions jsonb not null default '{}'::jsonb,warnings jsonb not null default '[]'::jsonb,created_at timestamptz not null default now(),
 unique(replay_run_id,evaluation_date,asset_id));
create index validation_replay_points_lookup on public.validation_replay_points(replay_run_id,asset_id,evaluation_date);
alter table public.validation_replay_points enable row level security;
create policy "authenticated users read validation replay points" on public.validation_replay_points for select to authenticated using(true);

create or replace view public.validation_replay_latest with(security_invoker=true)as select r.* from public.validation_replay_runs r where r.status='SUCCEEDED' order by r.completed_at desc limit 1;
grant select on public.validation_replay_latest to authenticated;
commit;
