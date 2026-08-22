import postgres from "postgres";

if (!process.env.CMIP_DB_URL) throw new Error("CMIP_DB_URL is missing");
const sql = postgres(process.env.CMIP_DB_URL, { ssl: "require", max: 1 });
try {
  const observations = await sql`
    select i.code, count(c.id)::int as canonical_count, min(c.observed_at) as oldest, max(c.observed_at) as latest,
           (array_agg(c.value order by c.observed_at desc))[1] as latest_value
    from public.indicators i left join public.canonical_observations c on c.indicator_id = i.id
    group by i.code order by i.code`;
  const runs = await sql`select status, count(*)::int as count from public.ingestion_runs group by status order by status`;
  const safeguards = await sql`
    select tgname from pg_trigger
    where tgrelid in ('public.raw_observations'::regclass, 'public.canonical_observations'::regclass)
      and not tgisinternal order by tgname`;
  const unresolvedQualityEvents = await sql`
    select i.code, e.event_type, count(*)::int as count
    from public.data_quality_events e join public.indicators i on i.id = e.indicator_id
    where e.resolved_at is null group by i.code, e.event_type order by i.code, e.event_type`;
  console.log(JSON.stringify({ observations, runs, safeguards, unresolvedQualityEvents }, null, 2));
} finally {
  await sql.end();
}
