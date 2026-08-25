import { describe, expect, it } from "vitest";
import { fifoLots, parsePortfolioCsv } from "./portfolio";
describe("portfolio import", () => {
  it("parses the frozen CSV schema", () =>
    expect(
      parsePortfolioCsv(
        "executed_at,type,symbol,quantity,unit_price,fee,notes\n2026-01-01,BUY,BTC,1,100,1,first",
      )[0],
    ).toMatchObject({ symbol: "BTC", quantity: 1 }));
  it("rejects malformed rows", () =>
    expect(() => parsePortfolioCsv("type,symbol\nBUY,BTC")).toThrow());
});
describe("FIFO lots", () => {
  it("attributes pnl FIFO", () => {
    const r = fifoLots([
      { type: "BUY", quantity: 1, unitPrice: 100, fee: 0, executedAt: "1" },
      { type: "BUY", quantity: 1, unitPrice: 200, fee: 0, executedAt: "2" },
      { type: "SELL", quantity: 1.5, unitPrice: 300, fee: 0, executedAt: "3" },
    ]);
    expect(r.matches.map((x) => x.realizedPnl)).toEqual([200, 50]);
    expect(r.openLots[0]?.quantity).toBe(0.5);
  });
  it("rejects overselling", () =>
    expect(() =>
      fifoLots([
        { type: "SELL", quantity: 1, unitPrice: 1, fee: 0, executedAt: "1" },
      ]),
    ).toThrow());
});
