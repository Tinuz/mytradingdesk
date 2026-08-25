import { createClient } from "@supabase/supabase-js";
const req = (n: string) => {
    const v = process.env[n];
    if (!v) throw new Error(`${n} missing`);
    return v;
  },
  db = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  ),
  connectorId = req("READ_ONLY_CONNECTOR_ID"),
  payload = JSON.parse(req("READ_ONLY_SYNC_PAYLOAD")) as {
    balances: Record<string, number>;
    fills: Array<{
      id: string;
      type: "BUY" | "SELL";
      symbol: "BTC" | "ETH";
      quantity: number;
      unitPrice: number;
      fee: number;
      executedAt: string;
    }>;
  },
  { data: connector, error } = await db
    .from("read_only_connectors")
    .select("*,portfolio_accounts(id)")
    .eq("id", connectorId)
    .single();
if (error) throw error;
const permissions = connector.permissions as Record<string, boolean>;
if (
  permissions.trade !== false ||
  permissions.withdraw !== false ||
  permissions.read !== true
)
  throw new Error("Connector is not provably read-only");
const started = new Date(),
  { data: run, error: runError } = await db
    .from("connector_sync_runs")
    .insert({
      user_id: connector.user_id,
      connector_id: connector.id,
      started_at: started.toISOString(),
      status: "RUNNING",
    })
    .select("id")
    .single();
if (runError) throw runError;
try {
  for (const fill of payload.fills) {
    if (
      !["BUY", "SELL"].includes(fill.type) ||
      !["BTC", "ETH"].includes(fill.symbol) ||
      fill.quantity <= 0 ||
      fill.unitPrice <= 0
    )
      throw new Error("Invalid read-only fill payload");
    const insert = await db.from("portfolio_transactions").upsert(
      {
        user_id: connector.user_id,
        account_id: connector.account_id,
        transaction_type: fill.type,
        symbol: fill.symbol,
        quantity: fill.quantity,
        unit_price: fill.unitPrice,
        fee: fill.fee,
        executed_at: fill.executedAt,
        external_reference: `${connector.provider}:${fill.id}`,
        notes: "Read-only imported fill",
      },
      {
        onConflict: "user_id,account_id,external_reference",
        ignoreDuplicates: true,
      },
    );
    if (insert.error) throw insert.error;
  }
  const { data: holdings, error: he } = await db
    .from("portfolio_holdings")
    .select("symbol,quantity")
    .eq("account_id", connector.account_id);
  if (he) throw he;
  const ledger = Object.fromEntries(
      (holdings ?? []).map((x) => [x.symbol, Number(x.quantity)]),
    ),
    differences = Object.fromEntries(
      [
        ...new Set([...Object.keys(payload.balances), ...Object.keys(ledger)]),
      ].map((s) => [
        s,
        Number(payload.balances[s] ?? 0) - Number(ledger[s] ?? 0),
      ]),
    ),
    status = Object.values(differences).every((x) => Math.abs(x) <= 0.00000001)
      ? "MATCHED"
      : "BREAK",
    { data: reconciliation, error: re } = await db
      .from("portfolio_reconciliations")
      .insert({
        user_id: connector.user_id,
        account_id: connector.account_id,
        statement_at: new Date().toISOString(),
        statement_balances: payload.balances,
        ledger_balances: ledger,
        differences,
        tolerance: 0.00000001,
        status,
      })
      .select("id")
      .single();
  if (re) throw re;
  const update = await db
    .from("connector_sync_runs")
    .update({
      completed_at: new Date().toISOString(),
      status: status === "MATCHED" ? "SUCCEEDED" : "RECONCILIATION_BREAK",
      balances_received: payload.balances,
      fills_received: payload.fills.length,
      reconciliation_id: reconciliation.id,
    })
    .eq("id", run.id);
  if (update.error) throw update.error;
  await db
    .from("read_only_connectors")
    .update({
      last_sync_at: new Date().toISOString(),
      status: status === "MATCHED" ? "CONNECTED" : "ERROR",
    })
    .eq("id", connector.id);
  console.log(
    JSON.stringify(
      {
        connector: connector.id,
        status,
        fills: payload.fills.length,
        differences,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await db
    .from("connector_sync_runs")
    .update({
      completed_at: new Date().toISOString(),
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown",
    })
    .eq("id", run.id);
  throw error;
}
