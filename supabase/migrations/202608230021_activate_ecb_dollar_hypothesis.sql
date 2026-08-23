begin;

update public.indicators set
  category='macro_liquidity',
  data_contract=data_contract || '{"activationStatus":"ACTIVE_HYPOTHESIS","regimeFactor":"DOLLAR_STRENGTH_ECB_90D","changeWindowDays":90,"supportiveThresholdPercent":-2,"restrictiveThresholdPercent":2,"maximumAbsoluteScore":1,"validationSeries":"US_BROAD_DOLLAR_INDEX"}'::jsonb,
  factor_family='RATES_AND_DOLLAR',factor_classification='CONTEXT',classification_status='HYPOTHESIS',
  canonical_source='ECB-derived DXY proxy'
where code='DXY_PROXY_ECB';

update public.indicators set
  data_contract=data_contract || '{"activationStatus":"VALIDATION_ONLY","validatesFactor":"DOLLAR_STRENGTH_ECB_90D"}'::jsonb,
  validation_source='FRED DTWEXBGS'
where code='US_BROAD_DOLLAR_INDEX';

insert into public.engine_versions(version,configuration,description,activated_at) values
  ('0.5.1-hypothesis.1','{"model":"v3","regimeEngineActive":true,"assumptionStatus":"HYPOTHESIS","dollarStrength":{"factor":"DOLLAR_STRENGTH_ECB_90D","source":"DXY_PROXY_ECB","windowDays":90,"supportiveAtOrBelowPercent":-2,"restrictiveAtOrAbovePercent":2,"maximumAbsoluteScore":1,"validationSeries":"US_BROAD_DOLLAR_INDEX","divergenceLowersConfidence":true,"officialDxy":false},"minimumFamilies":{"macro":2,"cryptoCredit":2,"marketStructure":2,"asset":1}}','Activates the separately named ECB-derived dollar-strength hypothesis with capped context contribution and FRED direction validation.',now()),
  ('0.6.1-hypothesis.1','{"model":"v3","regimeEngineVersion":"0.5.1-hypothesis.1","decisionEngineActive":true,"matrixCombinations":625,"persistenceObservations":2,"hysteresisActive":true,"dollarStrengthHypothesisActive":true,"assumptionStatus":"HYPOTHESIS"}','Decision Engine using the versioned ECB dollar-strength hypothesis; FRED divergence lowers confidence through explicit warnings.',now())
on conflict(version) do nothing;

commit;
