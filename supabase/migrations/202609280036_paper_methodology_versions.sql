-- Registers the corrected paper-portfolio and recommendation-outcome
-- methodologies. Rows written under the v1 labels remain unchanged.
begin;

insert into public.methodology_versions(methodology_type,code,version,status,rationale,configuration,expected_effect,evidence,activated_at) values
  ('BENCHMARK','PAPER_NAV','paper-nav-v2','SHADOW',
   'Paper execution and the four frozen benchmark-v1 baselines as pure, replayable functions.',
   '{"protocol":"cas-shadow-protocol-v1","decisionProcessing":"LATEST_SIGNOFF_ONCE_AT_NEXT_VALUATION","freeze":"NEWEST_RECOMMENDATION_NOT_AVAILABLE_BLOCKS_INCREASES","prices":"VALID_ONLY","modifiedTargets":"RANGE_MIDDLE_WITH_MANDATE_CASH_FLOOR","benchmarkState":"benchmark-state-v1","monthlyRebalance":"FIRST_VALUATION_OF_NEW_UTC_MONTH","dmaSignal":"PRIOR_UTC_CLOSE_VS_200_DAILY_CLOSES","dmaExecution":"NEXT_VALUATION","dmaMissing":"HOLD_PREVIOUS_WEIGHT","feesBps":10,"slippageBps":5,"benchmarkFeesBps":10,"previousVersion":"paper-nav-v1"}',
   'Approved decisions execute once at the next valuation; benchmarks follow benchmark-v1 instead of buy-and-hold drift and no longer reset after missing data.',
   '{}', now()),
  ('RISK','RECOMMENDATION_OUTCOME','recommendation-outcome-v2','SHADOW',
   'Forward outcome of recommendation target weights with excursions limited to the holding period.',
   '{"horizonsDays":[1,7,30,90,180],"entry":"LAST_VALID_PRICE_AT_OR_BEFORE_RECOMMENDATION","exit":"FIRST_VALID_PRICE_AT_OR_AFTER_HORIZON","exitToleranceDays":2,"excursions":"HOLDING_PERIOD_INCLUDING_ENTRY","unavailable":"RECORDED_AFTER_TOLERANCE","previousVersion":"recommendation-outcome-v1"}',
   'Adverse and favourable excursions no longer include prices from before entry or after exit.',
   '{}', now())
on conflict(methodology_type,code,version) do nothing;

commit;
