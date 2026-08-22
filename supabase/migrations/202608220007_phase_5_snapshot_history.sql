begin;

alter table public.decision_snapshots
  add column if not exists candidate_state text check (candidate_state is null or candidate_state in ('STRONG_ACCUMULATION', 'ACCUMULATION', 'NEUTRAL', 'RISK_REDUCTION', 'DEFENSIVE')),
  add column if not exists pending_state text check (pending_state is null or pending_state in ('STRONG_ACCUMULATION', 'ACCUMULATION', 'NEUTRAL', 'RISK_REDUCTION', 'DEFENSIVE')),
  add column if not exists consecutive_observations integer not null default 0 check (consecutive_observations >= 0),
  add column if not exists transition_reason text;

create index if not exists decision_snapshots_history
  on public.decision_snapshots (asset_id, calculated_at desc, engine_version);

commit;
