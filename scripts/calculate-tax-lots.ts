import { createClient } from "@supabase/supabase-js";
import { fifoLots } from "@cmip/domain";
const req = (n: string) => {
    const v = process.env[n];
    if (!v) throw new Error(`${n} missing`);
    return v;
  },
  db = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
const { data: accounts, error } = await db
  .from("portfolio_accounts")
  .select("id,user_id");
if (error) throw error;
const output = [];
for (const account of accounts ?? []) {
  const { data: transactions, error: te } = await db
    .from("portfolio_transactions")
    .select("id,transaction_type,symbol,quantity,unit_price,fee,executed_at")
    .eq("account_id", account.id)
    .in("transaction_type", ["BUY", "SELL"])
    .order("executed_at");
  if (te) throw te;
  let count = 0;
  for (const symbol of ["BTC", "ETH"]) {
    const result = fifoLots(
      (transactions ?? [])
        .filter((t) => t.symbol === symbol)
        .map((t) => ({
          id: t.id,
          type: t.transaction_type as "BUY" | "SELL",
          symbol: t.symbol,
          quantity: Number(t.quantity),
          unitPrice: Number(t.unit_price),
          fee: Number(t.fee),
          executedAt: t.executed_at,
        })),
    );
    for (const lot of result.matches) {
      const buyId = transactions?.find(
        (t) =>
          t.symbol === symbol &&
          t.transaction_type === "BUY" &&
          t.executed_at === lot.openedAt,
      )?.id;
      const sellId = transactions?.find(
        (t) =>
          t.symbol === symbol &&
          t.transaction_type === "SELL" &&
          t.executed_at === lot.closedAt,
      )?.id;
      if (!buyId || !sellId)
        throw new Error("FIFO provenance could not be reconstructed");
      const insert = await db.from("portfolio_lot_matches").upsert(
        {
          user_id: account.user_id,
          account_id: account.id,
          symbol,
          buy_transaction_id: buyId,
          sell_transaction_id: sellId,
          quantity: lot.quantity,
          cost_basis: lot.costBasis,
          proceeds: lot.proceeds,
          realized_pnl: lot.realizedPnl,
          calculation_version: "fifo-v1",
        },
        {
          onConflict:
            "account_id,buy_transaction_id,sell_transaction_id,calculation_version",
          ignoreDuplicates: true,
        },
      );
      if (insert.error) throw insert.error;
      count++;
    }
    for (const lot of result.openLots) {
      const buyId = transactions?.find(
        (t) =>
          t.symbol === symbol &&
          t.transaction_type === "BUY" &&
          t.executed_at === lot.openedAt,
      )?.id;
      if (!buyId)
        throw new Error("Open FIFO provenance could not be reconstructed");
      const insert = await db.from("portfolio_lot_matches").upsert(
        {
          user_id: account.user_id,
          account_id: account.id,
          symbol,
          buy_transaction_id: buyId,
          sell_transaction_id: null,
          quantity: lot.quantity,
          cost_basis: lot.quantity * lot.unitCost,
          proceeds: null,
          realized_pnl: null,
          calculation_version: "fifo-v1",
        },
        {
          onConflict:
            "account_id,buy_transaction_id,sell_transaction_id,calculation_version",
          ignoreDuplicates: true,
        },
      );
      if (insert.error) throw insert.error;
      count++;
    }
  }
  output.push({ account: account.id, lots: count });
}
console.log(JSON.stringify({ accounts: output }, null, 2));
