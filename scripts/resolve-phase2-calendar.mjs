import postgres from "postgres";

if (!process.env.CMIP_DB_URL) throw new Error("CMIP_DB_URL is missing");
const sql = postgres(process.env.CMIP_DB_URL, { ssl: "require", max: 1 });
try {
  const resolved = await sql`
    update public.data_quality_events e set resolved_at = now()
    from public.indicators i
    where e.indicator_id = i.id and i.code = 'STABLECOIN_SUPPLY_USD'
      and e.event_type = 'MISSING_INTERVAL' and e.resolved_at is null
      and extract(dow from ((e.details->>'from')::timestamptz)) in (0, 6)
    returning e.id`;
  console.log(JSON.stringify({ resolvedFalseWeekendEvents: resolved.length }));
  const corrected = await sql`
    update public.data_quality_events e set
      resolved_at = now(),
      details = e.details || '{"resolution":"historical persistence error; classifier fixed"}'::jsonb
    from public.indicators i
    where e.indicator_id = i.id and i.code = 'BTC_USD'
      and e.event_type = 'PROVIDER_FAILURE' and e.resolved_at is null
      and e.details->>'message' like '%unique or exclusion constraint%'
    returning e.id`;
  console.log(
    JSON.stringify({
      resolvedMisclassifiedPersistenceEvents: corrected.length,
    }),
  );
} finally {
  await sql.end();
}
