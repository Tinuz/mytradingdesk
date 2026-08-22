begin;

insert into public.providers (name, priority, supports_backfill)
values
  ('defillama', 1, true),
  ('sosovalue', 1, true),
  ('fred-liquidity', 1, true)
on conflict (name) do update set priority = excluded.priority, supports_backfill = excluded.supports_backfill;

insert into public.indicators (code, name, category, unit, expected_frequency, stale_after_seconds, data_contract)
values
  ('STABLECOIN_SUPPLY_USD', 'Total USD-pegged stablecoin circulating supply', 'crypto_liquidity', 'usd', interval '1 day', 129600,
   '{"minimum":1000000000,"maximum":10000000000000,"maxPlausibleChangePercent":10,"canonicalProvider":"defillama","reconciliationTolerancePercent":2,"assumptionStatus":"HYPOTHESIS","requestedCadence":"4 hours","sourceFrequency":"daily"}'),
  ('BTC_ETF_NET_FLOW_USD', 'US spot Bitcoin ETF daily net flow', 'institutional_flows', 'usd', interval '1 day', 259200,
   '{"minimum":-10000000000,"maximum":10000000000,"maxPlausibleChangePercent":100000,"canonicalProvider":"sosovalue","historyLimitDays":300,"assumptionStatus":"HYPOTHESIS"}'),
  ('ETH_ETF_NET_FLOW_USD', 'US spot Ethereum ETF daily net flow', 'institutional_flows', 'usd', interval '1 day', 259200,
   '{"minimum":-10000000000,"maximum":10000000000,"maxPlausibleChangePercent":100000,"canonicalProvider":"sosovalue","historyLimitDays":300,"assumptionStatus":"HYPOTHESIS"}'),
  ('US_NET_LIQUIDITY_USD', 'US net liquidity proxy', 'macro_liquidity', 'usd_billions', interval '7 days', 864000,
   '{"minimum":-5000,"maximum":20000,"maxPlausibleChangePercent":20,"canonicalProvider":"fred-liquidity","formula":"WALCL/1000-WTREGEN/1000-RRPONTSYD","components":{"WALCL":"usd_millions","WTREGEN":"usd_millions","RRPONTSYD":"usd_billions"},"assumptionStatus":"HYPOTHESIS"}')
on conflict (code) do nothing;

commit;
