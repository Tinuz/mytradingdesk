begin;

create table public.methodology_versions(
 id uuid primary key default gen_random_uuid(),methodology_type text not null check(methodology_type in('FACTOR','VALUATION','SCENARIO','RISK','ALLOCATION','BENCHMARK')),
 code text not null,version text not null,status text not null check(status in('DRAFT','SHADOW','VALIDATED','RETIRED')),rationale text not null,configuration jsonb not null,
 expected_effect text not null,evidence jsonb not null default '{}'::jsonb,activated_at timestamptz,retired_at timestamptz,created_at timestamptz not null default now(),unique(methodology_type,code,version));
alter table public.methodology_versions enable row level security;
create policy "authenticated users read methodologies" on public.methodology_versions for select to authenticated using(true);
create trigger methodology_versions_immutable before update or delete on public.methodology_versions for each row execute function public.prevent_observation_mutation();

create table public.source_governance(
 id uuid primary key default gen_random_uuid(),provider_id uuid not null references public.providers(id),version text not null,
 approval_status text not null check(approval_status in('REVIEW_REQUIRED','APPROVED','REJECTED','RETIRED')),source_url text,terms_url text,
 automation_rights text not null check(automation_rights in('UNKNOWN','ALLOWED','PROHIBITED')),historical_storage_rights text not null check(historical_storage_rights in('UNKNOWN','ALLOWED','PROHIBITED')),
 rate_limit text,freshness_contract text not null,fallback_policy text not null,reviewed_at timestamptz,notes text not null,created_at timestamptz not null default now(),unique(provider_id,version));
alter table public.source_governance enable row level security;
create policy "authenticated users read source governance" on public.source_governance for select to authenticated using(true);
create trigger source_governance_immutable before update or delete on public.source_governance for each row execute function public.prevent_observation_mutation();
insert into public.source_governance(provider_id,version,approval_status,automation_rights,historical_storage_rights,freshness_contract,fallback_policy,notes)
select id,'source-review-v1','REVIEW_REQUIRED','UNKNOWN','UNKNOWN','Existing indicator contract applies','Fail closed for allocation-critical use until reviewed','No rights inferred from technical API availability.' from public.providers;

create table public.portfolio_accounts(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,name text not null,base_currency text not null check(base_currency in('EUR','USD')),
 account_type text not null check(account_type in('MANUAL','EXCHANGE_READ_ONLY','BROKER_READ_ONLY')),created_at timestamptz not null default now(),unique(user_id,name));
alter table public.portfolio_accounts enable row level security;
create policy "users read own portfolio accounts" on public.portfolio_accounts for select to authenticated using((select auth.uid())=user_id);
create policy "users create own portfolio accounts" on public.portfolio_accounts for insert to authenticated with check((select auth.uid())=user_id);

create table public.portfolio_transactions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,account_id uuid not null references public.portfolio_accounts(id),
 transaction_type text not null check(transaction_type in('DEPOSIT','WITHDRAWAL','BUY','SELL','FEE')),symbol text not null check(symbol in('CASH','BTC','ETH')),
 quantity numeric not null check(quantity>0),unit_price numeric not null default 0 check(unit_price>=0),fee numeric not null default 0 check(fee>=0),executed_at timestamptz not null,
 external_reference text,notes text,created_at timestamptz not null default now(),check((transaction_type in('BUY','SELL')and symbol in('BTC','ETH')and unit_price>0)or(transaction_type in('DEPOSIT','WITHDRAWAL','FEE')and symbol='CASH')));
create unique index portfolio_transactions_external on public.portfolio_transactions(user_id,account_id,external_reference)where external_reference is not null;
alter table public.portfolio_transactions enable row level security;
create policy "users read own portfolio transactions" on public.portfolio_transactions for select to authenticated using((select auth.uid())=user_id);
create policy "users append own portfolio transactions" on public.portfolio_transactions for insert to authenticated with check((select auth.uid())=user_id and exists(select 1 from public.portfolio_accounts a where a.id=account_id and a.user_id=(select auth.uid())));
create trigger portfolio_transactions_immutable before update or delete on public.portfolio_transactions for each row execute function public.prevent_observation_mutation();

create table public.portfolio_snapshots(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,account_id uuid not null references public.portfolio_accounts(id),mandate_id uuid references public.investor_mandates(id),
 snapshot_at timestamptz not null,positions jsonb not null,cash_value numeric not null,total_value numeric not null,price_observation_ids uuid[] not null,calculation_version text not null,created_at timestamptz not null default now(),unique(account_id,snapshot_at,calculation_version));
alter table public.portfolio_snapshots enable row level security;
create policy "users read own portfolio snapshots" on public.portfolio_snapshots for select to authenticated using((select auth.uid())=user_id);
create trigger portfolio_snapshots_immutable before update or delete on public.portfolio_snapshots for each row execute function public.prevent_observation_mutation();

create view public.portfolio_holdings with(security_invoker=true)as
select account_id,user_id,symbol,sum(quantity)quantity from(
 select account_id,user_id,symbol,case when transaction_type='BUY'then quantity else-quantity end quantity from public.portfolio_transactions where transaction_type in('BUY','SELL')
 union all
 select account_id,user_id,'CASH',case when transaction_type='DEPOSIT'then quantity when transaction_type in('WITHDRAWAL','FEE')then-quantity when transaction_type='BUY'then-(quantity*unit_price+fee)when transaction_type='SELL'then quantity*unit_price-fee end
 from public.portfolio_transactions
)movements group by account_id,user_id,symbol;
grant select on public.portfolio_holdings to authenticated;
commit;
