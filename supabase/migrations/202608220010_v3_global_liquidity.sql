begin;

insert into public.providers (name, priority, supports_backfill)
values ('fred-global-liquidity', 1, true)
on conflict (name) do update set priority = excluded.priority, supports_backfill = excluded.supports_backfill;

insert into public.indicators (
  code, name, category, unit, expected_frequency, stale_after_seconds, data_contract,
  factor_family, factor_classification, classification_status, canonical_source
)
values (
  'GLOBAL_LIQUIDITY_USD', 'G3 central-bank assets liquidity proxy', 'macro_liquidity',
  'usd_billions', interval '31 days', 5356800,
  '{"minimum":1000,"maximum":100000,"maxPlausibleChangePercent":15,"canonicalProvider":"fred-global-liquidity","methodologyVersion":"g3-central-bank-assets-usd-v1","formula":"WALCL/1000 + ECBASSETSW*DEXUSEU/1000 + JPNASSETS*0.1/DEXJPUS","alignment":"latest observation at or before JPNASSETS anchor; no interpolation","limitations":["excludes China/PBoC","central-bank-assets proxy, not global M2"],"assumptionStatus":"HYPOTHESIS"}',
  'GLOBAL_LIQUIDITY', 'LEADING', 'HYPOTHESIS', 'FRED'
)
on conflict (code) do update set
  name = excluded.name, category = excluded.category, unit = excluded.unit,
  expected_frequency = excluded.expected_frequency, stale_after_seconds = excluded.stale_after_seconds,
  data_contract = excluded.data_contract, factor_family = excluded.factor_family,
  factor_classification = excluded.factor_classification,
  classification_status = excluded.classification_status, canonical_source = excluded.canonical_source;

update public.indicators set factor_family = 'US_LIQUIDITY', factor_classification = 'LEADING',
  classification_status = 'HYPOTHESIS', canonical_source = 'FRED'
where code = 'US_NET_LIQUIDITY_USD';

update public.indicators set factor_family = 'RATES_AND_DOLLAR', factor_classification = 'CONTEXT',
  classification_status = 'HYPOTHESIS', canonical_source = case code when 'DXY' then 'ICE Data Services' else 'FRED' end
where code in ('DXY', 'US10Y_REAL');

commit;
