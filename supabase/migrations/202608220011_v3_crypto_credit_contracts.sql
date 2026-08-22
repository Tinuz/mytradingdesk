begin;

insert into public.providers (name, priority, supports_backfill)
values ('defillama-loans', 1, true), ('internal-calculation', 1, true)
on conflict (name) do update set priority=excluded.priority, supports_backfill=excluded.supports_backfill;

insert into public.indicators (code,name,category,unit,expected_frequency,stale_after_seconds,data_contract,factor_family,factor_classification,classification_status,canonical_source)
values
  ('DEFI_ACTIVE_LOANS_USD','Active DeFi loans — fixed protocol universe v1','crypto_credit','usd',interval '1 day',172800,
   '{"minimum":0,"maximum":1000000000000,"maxPlausibleChangePercent":35,"canonicalProvider":"defillama-loans","methodologyVersion":"defillama-fixed-universe-v1","universe":["aave-v3","morpho-blue","sparklend","maple","kamino-lend","jupiter-lend","fluid-lending","euler-v2","compound-v3","venus-core-pool"],"limitations":["fixed universe is not all DeFi lending","protocol history may be revised by DefiLlama"],"assumptionStatus":"HYPOTHESIS"}',
   'ONCHAIN_CREDIT','LEADING','HYPOTHESIS','DefiLlama'),
  ('STABLECOIN_GROWTH_30D_PERCENT','Stablecoin supply 30-day growth','crypto_liquidity','percent',interval '1 day',172800,
   '{"derivation":"percent_change(STABLECOIN_SUPPLY_USD,30d)","calculationVersion":"crypto-credit-derived-v1","assumptionStatus":"HYPOTHESIS"}',
   'STABLECOIN_LIQUIDITY','LEADING','HYPOTHESIS','internal-calculation'),
  ('STABLECOIN_GROWTH_90D_PERCENT','Stablecoin supply 90-day growth','crypto_liquidity','percent',interval '1 day',172800,
   '{"derivation":"percent_change(STABLECOIN_SUPPLY_USD,90d)","calculationVersion":"crypto-credit-derived-v1","assumptionStatus":"HYPOTHESIS"}',
   'STABLECOIN_LIQUIDITY','CONFIRMING','HYPOTHESIS','internal-calculation'),
  ('STABLECOIN_GROWTH_ACCELERATION_PP','Stablecoin growth acceleration','crypto_liquidity','percentage_points',interval '1 day',172800,
   '{"derivation":"current_30d_growth - previous_30d_growth","calculationVersion":"crypto-credit-derived-v1","assumptionStatus":"HYPOTHESIS"}',
   'STABLECOIN_LIQUIDITY','LEADING','HYPOTHESIS','internal-calculation'),
  ('BTC_ETF_FLOW_20D_USD','BTC ETF rolling 20-session net flow','institutional_flows','usd',interval '1 day',259200,
   '{"derivation":"sum(BTC_ETF_NET_FLOW_USD,last_20_observations)","calculationVersion":"crypto-credit-derived-v1","assumptionStatus":"HYPOTHESIS"}',
   'INSTITUTIONAL_FLOWS','CONFIRMING','HYPOTHESIS','internal-calculation'),
  ('ETH_ETF_FLOW_20D_USD','ETH ETF rolling 20-session net flow','institutional_flows','usd',interval '1 day',259200,
   '{"derivation":"sum(ETH_ETF_NET_FLOW_USD,last_20_observations)","calculationVersion":"crypto-credit-derived-v1","assumptionStatus":"HYPOTHESIS"}',
   'INSTITUTIONAL_FLOWS','CONFIRMING','HYPOTHESIS','internal-calculation'),
  ('DEFI_LOANS_GROWTH_30D_PERCENT','Active DeFi loans 30-day growth','crypto_credit','percent',interval '1 day',172800,
   '{"derivation":"percent_change(DEFI_ACTIVE_LOANS_USD,30d)","calculationVersion":"crypto-credit-derived-v1","assumptionStatus":"HYPOTHESIS"}',
   'ONCHAIN_CREDIT','LEADING','HYPOTHESIS','internal-calculation')
on conflict (code) do update set
  name=excluded.name,category=excluded.category,unit=excluded.unit,expected_frequency=excluded.expected_frequency,
  stale_after_seconds=excluded.stale_after_seconds,data_contract=excluded.data_contract,factor_family=excluded.factor_family,
  factor_classification=excluded.factor_classification,classification_status=excluded.classification_status,canonical_source=excluded.canonical_source;

update public.indicators set factor_family='STABLECOIN_LIQUIDITY',factor_classification='LEADING',classification_status='HYPOTHESIS',canonical_source='DefiLlama'
where code='STABLECOIN_SUPPLY_USD';
update public.indicators set factor_family='INSTITUTIONAL_FLOWS',factor_classification='CONFIRMING',classification_status='HYPOTHESIS',canonical_source='SoSoValue'
where code in ('BTC_ETF_NET_FLOW_USD','ETH_ETF_NET_FLOW_USD');

create unique index if not exists indicator_snapshots_calculation_idempotency
  on public.indicator_snapshots(indicator_id,calculated_at,calculation_version);

commit;
