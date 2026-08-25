begin;
alter table public.asset_theses add column analyst_conviction text not null default 'MEDIUM' check(analyst_conviction in('LOW','MEDIUM','HIGH'));
alter table public.allocation_recommendations add column data_confidence text not null default 'LOW' check(data_confidence in('LOW','MEDIUM','HIGH'));
alter table public.allocation_recommendations add column model_evidence_status text not null default 'SHADOW' check(model_evidence_status in('HYPOTHESIS','SHADOW','VALIDATED','RETIRED'));
alter table public.allocation_recommendations add column thesis_conviction jsonb not null default '{}'::jsonb;
alter table public.fundamental_snapshots drop constraint fundamental_snapshots_module_check;
alter table public.fundamental_snapshots add constraint fundamental_snapshots_module_check check(module in('BTC_ONCHAIN','BTC_SUPPLY_DEMAND','ETH_ECONOMICS','RELATIVE_VALUE','QUALITY','MACRO_CYCLE','ROTATION','DERIVATIVES','L1_RELATIVE'));
insert into public.methodology_versions(methodology_type,code,version,status,rationale,configuration,expected_effect,evidence) values('VALUATION','L1_RELATIVE_VALUE','l1-relative-v1-shadow','SHADOW','Admission-stage comparison separates network activity from token-holder value accrual.','{"dimensions":["economicActivity","retention","developerTraction","capitalFlows","tokenIncentives","securityCost","dilution","valueAccrual"],"separateUsageAndHolderEconomics":true}','Blocks admission when liquidity, custody, data, fundamentals or exit capacity are insufficient.','{"eligibleAssets":[]}');
commit;
