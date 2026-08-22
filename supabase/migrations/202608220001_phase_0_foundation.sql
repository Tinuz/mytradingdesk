begin;

create extension if not exists pgcrypto;

create type public.observation_quality as enum ('VALID', 'STALE', 'SUSPECT', 'QUARANTINED', 'REJECTED');
create type public.confidence_level as enum ('LOW', 'MEDIUM', 'HIGH');
create type public.delivery_status as enum ('PENDING', 'DELIVERED', 'FAILED', 'SUPPRESSED');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique check (symbol in ('BTC', 'ETH')),
  name text not null,
  category text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  priority integer not null check (priority > 0),
  supports_backfill boolean not null,
  created_at timestamptz not null default now()
);

create table public.indicators (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  unit text not null,
  expected_frequency interval not null,
  stale_after_seconds integer not null check (stale_after_seconds > 0),
  data_contract jsonb not null check (jsonb_typeof(data_contract) = 'object'),
  created_at timestamptz not null default now()
);

create table public.raw_observations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id),
  indicator_id uuid not null references public.indicators(id),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  raw_value text,
  raw_payload jsonb not null,
  provider_reference text not null,
  created_at timestamptz not null default now(),
  unique (provider_id, indicator_id, observed_at, provider_reference)
);

create table public.canonical_observations (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.indicators(id),
  observed_at timestamptz not null,
  value numeric,
  quality_status public.observation_quality not null,
  canonical_provider_id uuid not null references public.providers(id),
  reconciliation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (indicator_id, observed_at, canonical_provider_id, created_at)
);

create table public.indicator_snapshots (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.indicators(id),
  calculated_at timestamptz not null,
  raw_value numeric,
  normalized_value smallint check (normalized_value between -2 and 2),
  trend text,
  calculation_version text not null,
  input_observation_ids uuid[] not null,
  created_at timestamptz not null default now()
);

create table public.engine_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  configuration jsonb not null,
  description text not null,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.regime_snapshots (
  id uuid primary key default gen_random_uuid(),
  regime_type text not null check (regime_type in ('MACRO', 'CRYPTO_LIQUIDITY', 'ASSET')),
  asset_id uuid references public.assets(id),
  calculated_at timestamptz not null,
  regime_score smallint not null check (regime_score between -2 and 2),
  regime_state text not null,
  confidence_level public.confidence_level not null,
  factor_breakdown jsonb not null,
  engine_version text not null references public.engine_versions(version),
  created_at timestamptz not null default now(),
  check ((regime_type = 'ASSET' and asset_id is not null) or (regime_type <> 'ASSET' and asset_id is null))
);

create table public.decision_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  calculated_at timestamptz not null,
  macro_regime_snapshot_id uuid not null references public.regime_snapshots(id),
  crypto_regime_snapshot_id uuid not null references public.regime_snapshots(id),
  asset_regime_snapshot_id uuid not null references public.regime_snapshots(id),
  decision_state text not null check (decision_state in ('STRONG_ACCUMULATION', 'ACCUMULATION', 'NEUTRAL', 'RISK_REDUCTION', 'DEFENSIVE')),
  previous_state text,
  confidence_level public.confidence_level not null,
  engine_version text not null references public.engine_versions(version),
  explanation_facts jsonb not null,
  created_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid references public.assets(id),
  decision_snapshot_id uuid references public.decision_snapshots(id),
  alert_type text not null,
  severity text not null,
  fingerprint text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivery_status public.delivery_status not null default 'PENDING',
  unique (user_id, fingerprint)
);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id),
  job_type text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null,
  records_received integer not null default 0 check (records_received >= 0),
  records_valid integer not null default 0 check (records_valid >= 0),
  records_rejected integer not null default 0 check (records_rejected >= 0),
  records_quarantined integer not null default 0 check (records_quarantined >= 0),
  error text,
  created_at timestamptz not null default now()
);

create table public.data_quality_events (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.indicators(id),
  provider_id uuid references public.providers(id),
  event_type text not null,
  severity text not null,
  details jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index raw_observations_lookup on public.raw_observations(indicator_id, observed_at desc);
create index canonical_observations_lookup on public.canonical_observations(indicator_id, observed_at desc);
create index regime_snapshots_lookup on public.regime_snapshots(regime_type, asset_id, calculated_at desc);
create index decision_snapshots_lookup on public.decision_snapshots(asset_id, calculated_at desc);

alter table public.assets enable row level security;
alter table public.providers enable row level security;
alter table public.indicators enable row level security;
alter table public.raw_observations enable row level security;
alter table public.canonical_observations enable row level security;
alter table public.indicator_snapshots enable row level security;
alter table public.regime_snapshots enable row level security;
alter table public.decision_snapshots enable row level security;
alter table public.alerts enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.data_quality_events enable row level security;
alter table public.engine_versions enable row level security;

create policy "authenticated users read assets" on public.assets for select to authenticated using (true);
create policy "authenticated users read providers" on public.providers for select to authenticated using (true);
create policy "authenticated users read indicators" on public.indicators for select to authenticated using (true);
create policy "authenticated users read canonical observations" on public.canonical_observations for select to authenticated using (true);
create policy "authenticated users read indicator snapshots" on public.indicator_snapshots for select to authenticated using (true);
create policy "authenticated users read regime snapshots" on public.regime_snapshots for select to authenticated using (true);
create policy "authenticated users read decision snapshots" on public.decision_snapshots for select to authenticated using (true);
create policy "authenticated users read engine versions" on public.engine_versions for select to authenticated using (true);
create policy "users read own alerts" on public.alerts for select to authenticated using ((select auth.uid()) = user_id);
create policy "users update own alerts" on public.alerts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Raw provider payloads, ingestion operations and quality events are intentionally
-- inaccessible through the client API. Service-role and protected server routes
-- may access them because the service role bypasses RLS.

commit;
