import { createClient } from "@supabase/supabase-js";
const req = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`${n} is missing`);
  return v;
};
const c = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
  asOf = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now());
const { data: accounts, error: ae } = await c
  .from("portfolio_accounts")
  .select("id,user_id,base_currency");
if (ae) throw ae;
const results = [];
async function price(code: string) {
  const { data } = await c
    .from("canonical_observations")
    .select(
      "id,value,observed_at,raw_observations!source_observation_id(received_at),indicators!inner(code)",
    )
    .eq("indicators.code", code)
    .lte("observed_at", asOf.toISOString())
    .order("observed_at", { ascending: false })
    .limit(20);
  const row = (data ?? []).find((x) => {
    const raw = x.raw_observations as unknown as { received_at: string } | null;
    return raw && new Date(raw.received_at) <= asOf;
  });
  return row ? { id: row.id, value: Number(row.value) } : null;
}
for (const a of accounts ?? []) {
  const { data: h } = await c
    .from("portfolio_holdings")
    .select("symbol,quantity")
    .eq("account_id", a.id);
  let fx = 1,
    blocked = "";
  const ids: string[] = [],
    positions: Record<string, unknown> = {};
  if (a.base_currency === "EUR") {
    const q = await price("EUR_USD");
    if (!q) blocked = "EUR_USD unavailable";
    else {
      fx = q.value;
      ids.push(q.id);
    }
  }
  let total = 0,
    cash = 0;
  for (const x of h ?? []) {
    const quantity = Number(x.quantity);
    if (x.symbol === "CASH") {
      cash = quantity;
      total += quantity;
      positions.CASH = { quantity, price: 1, value: quantity };
      continue;
    }
    const q = await price(`${x.symbol}_USD`);
    if (!q) {
      blocked = `${x.symbol}_USD unavailable`;
      break;
    }
    ids.push(q.id);
    const p = a.base_currency === "EUR" ? q.value / fx : q.value,
      value = quantity * p;
    positions[x.symbol] = { quantity, price: p, value };
    total += value;
  }
  if (blocked) {
    results.push({ account: a.id, status: "BLOCKED", blocked });
    continue;
  }
  const { data: m } = await c
    .from("investor_mandates")
    .select("id")
    .eq("user_id", a.user_id)
    .lte("effective_at", asOf.toISOString())
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await c.from("portfolio_snapshots").upsert(
    {
      user_id: a.user_id,
      account_id: a.id,
      mandate_id: m?.id ?? null,
      snapshot_at: asOf.toISOString(),
      positions,
      cash_value: cash,
      total_value: total,
      price_observation_ids: [...new Set(ids)],
      calculation_version: "portfolio-valuation-v1",
    },
    {
      onConflict: "account_id,snapshot_at,calculation_version",
      ignoreDuplicates: true,
    },
  );
  if (error) throw error;
  results.push({ account: a.id, status: "SNAPSHOTTED", total });
}
console.log(JSON.stringify({ asOf: asOf.toISOString(), results }, null, 2));
