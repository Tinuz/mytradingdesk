export interface PortfolioCsvRow {
  executedAt: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "BUY" | "SELL" | "FEE";
  symbol: "CASH" | "BTC" | "ETH";
  quantity: number;
  unitPrice: number;
  fee: number;
  notes: string;
}
export function parsePortfolioCsv(input: string): PortfolioCsvRow[] {
  const lines = input.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV requires a header and rows");
  const header = lines[0]!.split(",").map((x) => x.trim().toLowerCase()),
    required = [
      "executed_at",
      "type",
      "symbol",
      "quantity",
      "unit_price",
      "fee",
    ];
  for (const x of required)
    if (!header.includes(x)) throw new Error(`CSV column missing: ${x}`);
  return lines
    .slice(1)
    .filter(Boolean)
    .map((line, index) => {
      const cells = line.split(",").map((x) => x.trim()),
        get = (x: string) => cells[header.indexOf(x)] ?? "",
        type = get("type") as PortfolioCsvRow["type"],
        symbol = get("symbol") as PortfolioCsvRow["symbol"],
        quantity = Number(get("quantity")),
        unitPrice = Number(get("unit_price")),
        fee = Number(get("fee"));
      if (
        !["DEPOSIT", "WITHDRAWAL", "BUY", "SELL", "FEE"].includes(type) ||
        !["CASH", "BTC", "ETH"].includes(symbol) ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        !Number.isFinite(fee) ||
        fee < 0 ||
        Number.isNaN(Date.parse(get("executed_at")))
      )
        throw new Error(`Invalid CSV row ${index + 2}`);
      return {
        executedAt: new Date(get("executed_at")).toISOString(),
        type,
        symbol,
        quantity,
        unitPrice,
        fee,
        notes: get("notes"),
      };
    });
}
export interface LotTrade {
  type: "BUY" | "SELL";
  quantity: number;
  unitPrice: number;
  fee: number;
  executedAt: string;
}
export function fifoLots(trades: readonly LotTrade[]) {
  const lots: Array<{ quantity: number; unitCost: number; openedAt: string }> =
      [],
    matches: Array<{
      quantity: number;
      costBasis: number;
      proceeds: number;
      realizedPnl: number;
      openedAt: string;
      closedAt: string;
    }> = [];
  for (const t of [...trades].sort((a, b) =>
    a.executedAt.localeCompare(b.executedAt),
  )) {
    if (t.type === "BUY") {
      lots.push({
        quantity: t.quantity,
        unitCost: (t.quantity * t.unitPrice + t.fee) / t.quantity,
        openedAt: t.executedAt,
      });
      continue;
    }
    let remaining = t.quantity;
    while (remaining > 1e-12) {
      const lot = lots[0];
      if (!lot) throw new Error("SELL exceeds available FIFO inventory");
      const quantity = Math.min(remaining, lot.quantity),
        costBasis = quantity * lot.unitCost,
        proceeds = quantity * t.unitPrice - t.fee * (quantity / t.quantity);
      matches.push({
        quantity,
        costBasis,
        proceeds,
        realizedPnl: proceeds - costBasis,
        openedAt: lot.openedAt,
        closedAt: t.executedAt,
      });
      lot.quantity -= quantity;
      remaining -= quantity;
      if (lot.quantity <= 1e-12) lots.shift();
    }
  }
  return { openLots: lots, matches };
}
