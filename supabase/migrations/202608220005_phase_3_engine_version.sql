begin;

insert into public.engine_versions (version, configuration, description, activated_at)
values (
  '0.3.0-hypothesis.1',
  '{"phase":3,"assumptionStatus":"HYPOTHESIS","regimes":["MACRO","CRYPTO_LIQUIDITY","BTC_ASSET","ETH_ASSET"],"decisionEngineActive":false,"missingDxyPolicy":"exclude_from_average_reduce_coverage_block_strong_result"}',
  'Initial deterministic regime classification hypotheses; no decision engine or alerts.',
  now()
)
on conflict (version) do nothing;

commit;
