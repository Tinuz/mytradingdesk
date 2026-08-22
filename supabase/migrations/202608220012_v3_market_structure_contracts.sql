begin;
insert into public.providers(name,priority,supports_backfill) values
 ('bgeometrics',1,true),('coinalyze',1,true),('coingecko-market-cap',1,true)
on conflict(name) do update set priority=excluded.priority,supports_backfill=excluded.supports_backfill;

insert into public.indicators(code,name,category,unit,expected_frequency,stale_after_seconds,data_contract,factor_family,factor_classification,classification_status,canonical_source)
values
 ('BTC_MVRV','Bitcoin MVRV','market_structure','ratio',interval '1 day',172800,'{"minimum":0,"maximum":20,"canonicalProvider":"bgeometrics","historyLimitYears":4,"assumptionStatus":"HYPOTHESIS"}','ONCHAIN_VALUATION','RISK','HYPOTHESIS','BGeometrics'),
 ('BTC_REALIZED_LOSSES_USD','Bitcoin realized losses','market_structure','usd',interval '1 day',172800,'{"minimum":0,"maximum":100000000000,"canonicalProvider":"bgeometrics","normalization":"absolute magnitude of provider-negative realizedLoss","historyLimitYears":4,"assumptionStatus":"HYPOTHESIS"}','CAPITULATION','RISK','HYPOTHESIS','BGeometrics'),
 ('BTC_PERPETUAL_OI_USD','Bitcoin perpetual open interest — fixed venue universe v1','market_structure','usd',interval '1 day',172800,'{"minimum":0,"maximum":1000000000000,"canonicalProvider":"coinalyze","methodologyVersion":"coinalyze-btc-perp-fixed-universe-v1","convertToUsd":true,"universe":["BTC.H","BTC-PERPETUAL.2","BTC-USD.8","BTCUSD_PERP.0","BTCUSDT.6","BTCUSDT_PERP.3","BTCUSDT_PERP.4","BTCUSDT_PERP.A","BTCUSDT_PERP.F","pf_xbtusd.K"],"assumptionStatus":"HYPOTHESIS"}','DERIVATIVES_LEVERAGE','RISK','HYPOTHESIS','Coinalyze'),
 ('BTC_MARKET_CAP_USD','Bitcoin market capitalization','market_structure','usd',interval '1 day',172800,'{"minimum":1000000000,"maximum":100000000000000,"canonicalProvider":"bgeometrics","fallbackProvider":"coingecko-market-cap","historyLimitYears":4,"assumptionStatus":"HYPOTHESIS"}','ONCHAIN_VALUATION','CONTEXT','HYPOTHESIS','BGeometrics'),
 ('BTC_OI_MARKET_CAP_RATIO','Bitcoin perpetual OI / market cap','market_structure','ratio',interval '1 day',172800,'{"derivation":"BTC_PERPETUAL_OI_USD/BTC_MARKET_CAP_USD","calculationVersion":"market-structure-derived-v1","assumptionStatus":"HYPOTHESIS"}','DERIVATIVES_LEVERAGE','RISK','HYPOTHESIS','internal-calculation'),
 ('BTC_OI_DRAWDOWN_FROM_HIGH_PERCENT','Bitcoin perpetual OI drawdown from observed high','market_structure','percent',interval '1 day',172800,'{"derivation":"(OI/running_high_OI-1)*100","calculationVersion":"market-structure-derived-v1","assumptionStatus":"HYPOTHESIS"}','DERIVATIVES_LEVERAGE','RISK','HYPOTHESIS','internal-calculation')
on conflict(code) do update set name=excluded.name,category=excluded.category,unit=excluded.unit,expected_frequency=excluded.expected_frequency,stale_after_seconds=excluded.stale_after_seconds,data_contract=excluded.data_contract,factor_family=excluded.factor_family,factor_classification=excluded.factor_classification,classification_status=excluded.classification_status,canonical_source=excluded.canonical_source;
update public.indicators set fallback_source='CoinGecko' where code='BTC_MARKET_CAP_USD';
commit;
