begin;

create table public.portfolio_reconciliations(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null references public.portfolio_accounts(id), statement_at timestamptz not null,
 statement_balances jsonb not null, ledger_balances jsonb not null, differences jsonb not null,
 tolerance numeric not null default 0.01, status text not null check(status in('MATCHED','BREAK')),
 created_at timestamptz not null default now()
);
create table public.portfolio_lot_matches(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null references public.portfolio_accounts(id), symbol text not null check(symbol in('BTC','ETH')),
 buy_transaction_id uuid not null references public.portfolio_transactions(id), sell_transaction_id uuid references public.portfolio_transactions(id),
 quantity numeric not null check(quantity>0), cost_basis numeric not null, proceeds numeric, realized_pnl numeric,
 calculation_version text not null, calculated_at timestamptz not null default now()
);
create unique index portfolio_lot_matches_replay_key on public.portfolio_lot_matches(account_id,buy_transaction_id,coalesce(sell_transaction_id,'00000000-0000-0000-0000-000000000000'::uuid),calculation_version);
create table public.fundamental_snapshots(
 id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.assets(id), calculated_at timestamptz not null,
 module text not null check(module in('BTC_ONCHAIN','BTC_SUPPLY_DEMAND','ETH_ECONOMICS','RELATIVE_VALUE','QUALITY','MACRO_CYCLE','ROTATION','DERIVATIVES')),
 methodology_version text not null, components jsonb not null, score numeric, coverage_percent numeric not null check(coverage_percent between 0 and 100),
 source_observation_ids uuid[] not null default '{}', evidence_status text not null check(evidence_status in('HYPOTHESIS','SHADOW','VALIDATED')),
 warnings jsonb not null default '[]', unique(asset_id,calculated_at,module,methodology_version)
);
create table public.source_reconciliation_rules(
 id uuid primary key default gen_random_uuid(), indicator_code text not null, primary_provider text not null, secondary_provider text,
 discrepancy_threshold_percent numeric not null check(discrepancy_threshold_percent>0), failure_action text not null default 'FREEZE_INCREASES',
 version text not null, status text not null check(status in('SHADOW','VALIDATED','RETIRED')), unique(indicator_code,version)
);
create table public.thesis_evidence(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 thesis_id uuid not null references public.asset_theses(id), observed_at timestamptz not null, classification text not null check(classification in('SUPPORTING','CONTRADICTING','IRRELEVANT','HARD_INVALIDATOR')),
 fact jsonb not null, source_url text, created_at timestamptz not null default now()
);
create table public.performance_analytics(
 id uuid primary key default gen_random_uuid(), paper_portfolio_id uuid not null references public.paper_portfolios(id),
 calculated_at timestamptz not null, window_start date not null, window_end date not null, metrics jsonb not null,
 attribution jsonb not null, calibration jsonb not null, methodology_version text not null,
 unique(paper_portfolio_id,calculated_at,methodology_version)
);
create table public.read_only_connectors(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null references public.portfolio_accounts(id), provider text not null,
 credential_reference text not null, permissions jsonb not null, status text not null check(status in('DISABLED','CONNECTED','ERROR')),
 last_sync_at timestamptz, created_at timestamptz not null default now(),
 check(permissions @> '{"trade":false,"withdraw":false}'::jsonb)
);

do $$ declare t text; begin foreach t in array array['portfolio_reconciliations','portfolio_lot_matches','fundamental_snapshots','source_reconciliation_rules','thesis_evidence','performance_analytics','read_only_connectors'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy "users own reconciliations" on public.portfolio_reconciliations for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "users read own lots" on public.portfolio_lot_matches for select to authenticated using(auth.uid()=user_id);
create policy "authenticated read fundamentals" on public.fundamental_snapshots for select to authenticated using(true);
create policy "authenticated read reconciliation rules" on public.source_reconciliation_rules for select to authenticated using(true);
create policy "users own thesis evidence" on public.thesis_evidence for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "users read own performance" on public.performance_analytics for select to authenticated using(exists(select 1 from public.paper_portfolios p where p.id=paper_portfolio_id and p.user_id=auth.uid()));
create policy "users own read connectors" on public.read_only_connectors for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create trigger reconciliations_immutable before update or delete on public.portfolio_reconciliations for each row execute function public.prevent_observation_mutation();
create trigger lots_immutable before update or delete on public.portfolio_lot_matches for each row execute function public.prevent_observation_mutation();
create trigger fundamentals_immutable before update or delete on public.fundamental_snapshots for each row execute function public.prevent_observation_mutation();
create trigger thesis_evidence_immutable before update or delete on public.thesis_evidence for each row execute function public.prevent_observation_mutation();
create trigger performance_immutable before update or delete on public.performance_analytics for each row execute function public.prevent_observation_mutation();

insert into public.source_reconciliation_rules(indicator_code,primary_provider,secondary_provider,discrepancy_threshold_percent,version,status) values
('BTC_USD','CoinGecko','Coinbase',1.0,'reconciliation-v1','SHADOW'),
('ETH_USD','CoinGecko','Coinbase',1.0,'reconciliation-v1','SHADOW'),
('EUR_USD','ECB',null,0.5,'reconciliation-v1','SHADOW');

insert into public.methodology_versions(methodology_type,code,version,status,rationale,configuration,expected_effect,evidence) values
('VALUATION','BTC_ONCHAIN','btc-onchain-v1-shadow','SHADOW','Two-family on-chain valuation contract; unavailable components reduce coverage.','{"families":["realized_price_mvrv","holder_cost_basis"],"missing":"reduce_coverage"}','Fair-value bands with explicit source vintage.','{"prospective":false}'),
('VALUATION','ETH_ECONOMICS','eth-economics-v1-shadow','SHADOW','Value-accrual score separates activity from token-holder economics.','{"dimensions":["fees","burn","issuance","staking","blobs","stablecoins","dex"],"activityIsNotValueCapture":true}','Fundamental coverage and value-capture evidence.','{"prospective":false}'),
('SCENARIO','PORTFOLIO_LAB','scenario-lab-v1-shadow','SHADOW','Deterministic bull/base/bear portfolio sensitivity with costs.','{"humanProbabilities":true,"execution":false}','Hypothetical scenario outcomes only.','{"calibrated":false}'),
('RISK','PERFORMANCE_ANALYTICS','performance-v1-shadow','SHADOW','Point-in-time risk, benchmark and attribution metrics.','{"identicalWindows":true,"costAware":true}','Auditable prospective performance evidence.','{"minimumDays":180}');
commit;
