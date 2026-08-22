begin;
create table public.pipeline_cycles(
 id uuid primary key default gen_random_uuid(),cycle_key text not null unique,trigger_type text not null check(trigger_type in('MANUAL','SCHEDULED','RETRY')),
 status text not null check(status in('RUNNING','SUCCEEDED','DEGRADED','FAILED','BLOCKED')),started_at timestamptz not null,completed_at timestamptz,
 heartbeat_at timestamptz not null,calculation_at timestamptz not null,failed_stage text,stages jsonb not null default '[]'::jsonb,error text,created_at timestamptz not null default now());
create index pipeline_cycles_recent on public.pipeline_cycles(started_at desc);
alter table public.pipeline_cycles enable row level security;
create policy "authenticated users read pipeline cycles" on public.pipeline_cycles for select to authenticated using(true);

create table public.provider_budget_policies(
 provider_id uuid primary key references public.providers(id),max_requests_per_hour integer,max_requests_per_day integer,
 schedule_class text not null check(schedule_class in('FREQUENT','DAILY','WEEKLY','MANUAL')),policy_version text not null,notes text not null);
insert into public.provider_budget_policies(provider_id,max_requests_per_hour,max_requests_per_day,schedule_class,policy_version,notes)
select id,case name when'bgeometrics'then 8 when'coinalyze'then 40 when'fred'then 120 else null end,case name when'bgeometrics'then 15 else null end,
case when name in('coingecko','twelve-data')then'FREQUENT'when name in('bgeometrics','coinalyze','defillama-loans','sosovalue')then'DAILY'when name='fred'then'WEEKLY'else'DAILY'end,
'provider-budget-v1','Hard limits where documented; null means external/undocumented and still requires monitoring.' from public.providers on conflict(provider_id)do nothing;
alter table public.provider_budget_policies enable row level security;
create policy "authenticated users read provider budgets" on public.provider_budget_policies for select to authenticated using(true);

create table public.validation_protocols(id uuid primary key default gen_random_uuid(),version text not null unique,status text not null check(status in('FROZEN','RETIRED')),frozen_at timestamptz not null,criteria jsonb not null,notes text not null);
insert into public.validation_protocols(version,status,frozen_at,criteria,notes)values('v1-shadow-protocol.1','FROZEN',now(),'{"minimumShadowDays":90,"minimumOperationalDays":30,"minimumPipelineSuccessRate":0.99,"maximumCriticalTrustDefects":0,"requiredPointInTimeGate":"PASSED","requiredHorizons":[30,90,180,365],"minimumNonOverlappingSamplesPerState":30,"baselines":["BUY_AND_HOLD","200DMA"],"thresholdChangesDuringWindow":false}','Precommitted V1 release criteria. Failure to meet a criterion blocks promotion; it does not justify changing the criterion after seeing results.');
alter table public.validation_protocols enable row level security;
create policy "authenticated users read validation protocols" on public.validation_protocols for select to authenticated using(true);

create table public.investor_journal_entries(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,decision_snapshot_id uuid references public.decision_snapshots(id),
 asset_id uuid references public.assets(id),entry_type text not null check(entry_type in('OBSERVATION','DECISION','REVIEW')),human_action text not null check(human_action in('NO_ACTION','REVIEW_ONLY','ADD_CAPITAL','REDUCE_RISK')),
 thesis text not null,invalidating_evidence text,review_on date,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.investor_journal_entries enable row level security;
create policy "users read own journal" on public.investor_journal_entries for select to authenticated using((select auth.uid())=user_id);
create policy "users insert own journal" on public.investor_journal_entries for insert to authenticated with check((select auth.uid())=user_id);
create policy "users update own journal" on public.investor_journal_entries for update to authenticated using((select auth.uid())=user_id)with check((select auth.uid())=user_id);

create table public.v1_gate_assessments(id uuid primary key default gen_random_uuid(),assessed_at timestamptz not null,protocol_version text not null references public.validation_protocols(version),overall_status text not null check(overall_status in('PASSED','BLOCKED')),gates jsonb not null,blockers jsonb not null,metrics jsonb not null,created_at timestamptz not null default now());
alter table public.v1_gate_assessments enable row level security;
create policy "authenticated users read v1 assessments" on public.v1_gate_assessments for select to authenticated using(true);
create or replace view public.pipeline_status with(security_invoker=true)as select p.*,case when now()-p.heartbeat_at>interval'30 minutes'then'SILENT'else'RESPONSIVE'end heartbeat_status from public.pipeline_cycles p order by p.started_at desc limit 1;
create or replace view public.v1_gate_latest with(security_invoker=true)as select v.* from public.v1_gate_assessments v order by v.assessed_at desc limit 1;
grant select on public.pipeline_status,public.v1_gate_latest to authenticated;
commit;
