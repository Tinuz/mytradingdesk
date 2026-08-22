import postgres from "postgres";

if (!process.env.CMIP_DB_URL) throw new Error("CMIP_DB_URL is missing");
const sql = postgres(process.env.CMIP_DB_URL, { ssl: "require", max: 1 });
try {
  const constraints = await sql`select conname from pg_constraint where conrelid = 'public.canonical_observations'::regclass order by conname`;
  console.log(constraints.map((row) => row.conname).join("\n"));
} finally {
  await sql.end();
}
