begin;
create table public.user_product_settings(
 user_id uuid primary key references auth.users(id) on delete cascade,
 experience_level text not null default 'GUIDED' check(experience_level in('GUIDED','ADVANCED')),
 onboarding_completed_at timestamptz, disclaimer_accepted_at timestamptz,
 actionable_notifications_only boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.recommendation_outcomes(
 id uuid primary key default gen_random_uuid(),recommendation_id uuid not null references public.allocation_recommendations(id),
 horizon_days integer not null check(horizon_days in(1,7,30,90,180)),observed_at timestamptz not null,
 asset_returns jsonb not null,portfolio_return_percent numeric,benchmark_return_percent numeric,
 adverse_excursion_percent numeric,favorable_excursion_percent numeric,outcome_status text not null check(outcome_status in('PENDING','OBSERVED','UNAVAILABLE')),
 price_observation_ids uuid[] not null default '{}',calculation_version text not null,unique(recommendation_id,horizon_days,calculation_version)
);
create table public.monthly_validation_reports(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 report_month date not null,protocol_version text not null,generated_at timestamptz not null,
 operational_metrics jsonb not null,decision_metrics jsonb not null,performance_metrics jsonb not null,
 data_quality_metrics jsonb not null,limitations jsonb not null,calculation_version text not null,
 unique(user_id,report_month,protocol_version,calculation_version)
);
create table public.connector_sync_runs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 connector_id uuid not null references public.read_only_connectors(id),started_at timestamptz not null,completed_at timestamptz,
 status text not null check(status in('RUNNING','SUCCEEDED','FAILED','RECONCILIATION_BREAK')),
 balances_received jsonb not null default '{}',fills_received integer not null default 0,
 reconciliation_id uuid references public.portfolio_reconciliations(id),error text
);
alter table public.user_product_settings enable row level security;alter table public.recommendation_outcomes enable row level security;alter table public.monthly_validation_reports enable row level security;alter table public.connector_sync_runs enable row level security;
create policy "users own product settings" on public.user_product_settings for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "users read own outcomes" on public.recommendation_outcomes for select to authenticated using(exists(select 1 from public.allocation_recommendations r where r.id=recommendation_id and r.user_id=auth.uid()));
create policy "users read own monthly reports" on public.monthly_validation_reports for select to authenticated using(auth.uid()=user_id);
create policy "users read own sync runs" on public.connector_sync_runs for select to authenticated using(auth.uid()=user_id);
create trigger recommendation_outcomes_immutable before update or delete on public.recommendation_outcomes for each row execute function public.prevent_observation_mutation();
create trigger monthly_reports_immutable before update or delete on public.monthly_validation_reports for each row execute function public.prevent_observation_mutation();

create or replace function public.complete_guided_onboarding(p_experience text,p_base_currency text,p_objective text,p_horizon integer,p_max_drawdown numeric,p_min_cash numeric,p_max_asset numeric,p_turnover numeric,p_cadence text,p_assets text[],p_starting_capital numeric)
returns void language plpgsql security invoker set search_path=public as $$declare uid uuid:=auth.uid();v_account_id uuid;v_mandate_id uuid;begin
 if uid is null then raise exception 'not authenticated';end if;
 if p_experience not in('GUIDED','ADVANCED')or p_base_currency not in('EUR','USD')or p_objective not in('CAPITAL_PRESERVATION','BALANCED','GROWTH')or p_cadence not in('WEEKLY','MONTHLY','QUARTERLY')or p_starting_capital<=0 then raise exception 'invalid onboarding input';end if;
 insert into public.user_product_settings(user_id,experience_level,onboarding_completed_at,disclaimer_accepted_at,updated_at)values(uid,p_experience,now(),now(),now())on conflict(user_id)do update set experience_level=excluded.experience_level,onboarding_completed_at=excluded.onboarding_completed_at,disclaimer_accepted_at=excluded.disclaimer_accepted_at,updated_at=now();
 insert into public.investor_mandates(user_id,version,base_currency,objective,horizon_months,maximum_drawdown_percent,minimum_cash_percent,maximum_asset_weight_percent,annual_turnover_budget_percent,rebalance_cadence,allowed_assets,evidence_status,effective_at)
 values(uid,'guided-v1-'||clock_timestamp(),p_base_currency,p_objective,p_horizon,p_max_drawdown,p_min_cash,p_max_asset,p_turnover,p_cadence,p_assets,'SHADOW',now())returning id into v_mandate_id;
 insert into public.portfolio_accounts(user_id,name,base_currency,account_type)values(uid,'Paper startportfolio',p_base_currency,'MANUAL')on conflict(user_id,name)do update set name=excluded.name returning id into v_account_id;
 if not exists(select 1 from public.portfolio_transactions where user_id=uid and account_id=v_account_id and external_reference='ONBOARDING_INITIAL_CAPITAL')then insert into public.portfolio_transactions(user_id,account_id,transaction_type,symbol,quantity,unit_price,fee,executed_at,external_reference,notes)values(uid,v_account_id,'DEPOSIT','CASH',p_starting_capital,0,0,now(),'ONBOARDING_INITIAL_CAPITAL','Fictief startkapitaal uit onboarding');end if;
 insert into public.paper_portfolios(user_id,protocol_version,base_currency,started_at,status,initial_capital)values(uid,'cas-shadow-protocol-v1',p_base_currency,now(),'ACTIVE',p_starting_capital)on conflict(user_id,protocol_version)do nothing;
end$$;
grant execute on function public.complete_guided_onboarding(text,text,text,integer,numeric,numeric,numeric,numeric,text,text[],numeric) to authenticated;
commit;
