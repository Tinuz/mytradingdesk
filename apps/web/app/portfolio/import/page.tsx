import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  importPortfolioCsv,
  portfolioOverview,
  reconcilePortfolio,
} from "../../../lib/data";
import { Shell } from "../../ui/shell";
export default async function PortfolioImportPage() {
  const { accounts } = await portfolioOverview();
  async function upload(f: FormData) {
    "use server";
    await importPortfolioCsv({
      accountId: String(f.get("account_id")),
      csv: String(f.get("csv")),
    });
    revalidatePath("/portfolio");
    revalidatePath("/portfolio/import");
  }
  async function reconcile(f: FormData) {
    "use server";
    await reconcilePortfolio({
      accountId: String(f.get("account_id")),
      statementBalances: String(f.get("balances")),
      tolerance: Number(f.get("tolerance")),
    });
    revalidatePath("/portfolio/import");
  }
  return (
    <Shell current="portfolio">
      <header className="page-head">
        <div>
          <span className="overline">CAS-011 / reconciliation</span>
          <h1>Portfolio CSV-import</h1>
          <p>
            Idempotente import volgens een vast schema; dubbele externe
            referenties worden niet opnieuw geboekt.
          </p>
        </div>
        <Link href="/portfolio">Terug naar portfolio →</Link>
      </header>
      <form action={upload} className="panel journal-form">
        <label>
          Account
          <select name="account_id" required>
            {accounts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.base_currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          CSV
          <textarea
            name="csv"
            required
            defaultValue={
              "executed_at,type,symbol,quantity,unit_price,fee,notes\n2026-01-01T12:00:00Z,DEPOSIT,CASH,10000,0,0,initial capital"
            }
          />
        </label>
        <p className="validation-warning">
          Kolommen: executed_at, type, symbol, quantity, unit_price, fee, notes.
          BUY/SELL gebruiken BTC of ETH; cashbewegingen worden automatisch CASH.
        </p>
        <button className="text-button" disabled={!accounts.length}>
          Importeren
        </button>
      </form>
      <form
        action={reconcile}
        className="panel journal-form mandate-benchmarks"
      >
        <div className="panel-head">
          <h2>Statement reconciliëren</h2>
        </div>
        <label>
          Account
          <select name="account_id" required>
            {accounts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Statement-saldi (JSON)
          <textarea
            name="balances"
            defaultValue={'{"CASH":10000,"BTC":0,"ETH":0}'}
            required
          />
        </label>
        <label>
          Tolerantie
          <input
            name="tolerance"
            type="number"
            min="0"
            step="any"
            defaultValue="0.01"
            required
          />
        </label>
        <button className="text-button" disabled={!accounts.length}>
          Reconciliatie vastleggen
        </button>
      </form>
    </Shell>
  );
}
