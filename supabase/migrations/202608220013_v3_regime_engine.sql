begin;
insert into public.engine_versions(version,configuration,description,activated_at)values(
 '0.5.0-hypothesis.2',
 '{"model":"v3","phase":5,"regimeEngineActive":true,"decisionEngineActive":false,"alertsActive":false,"assumptionStatus":"HYPOTHESIS","marketStructureScale":{"-2":"CAPITULATION","-1":"STRESSED","0":"HEALTHY","1":"ELEVATED_RISK","2":"OVERHEATED"},"minimumFamilies":{"macro":2,"cryptoCredit":2,"marketStructure":2,"asset":1}}',
 'V3 deterministic five-regime engine. Market structure is an independent risk/stress scale and decisions remain inactive.',now())
on conflict(version)do nothing;
commit;
