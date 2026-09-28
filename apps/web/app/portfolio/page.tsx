import { revalidatePath } from "next/cache";
import {
  appendPortfolioTransaction,
  createPortfolioAccount,
  portfolioOverview,
} from "../../lib/data";
import { Shell } from "../ui/shell";
import Link from "next/link";
const n = (f: FormData, k: string) => Number(f.get(k));
export default async function PortfolioPage() {
  const { accounts, holdings, transactions, prices } =
    await portfolioOverview();
  const exposures = holdings.map((h) => ({
      ...h,
      value:
        h.symbol === "CASH" ? h.quantity : h.quantity * (prices[h.symbol] ?? 0),
    })),
    total = exposures.reduce((s, x) => s + x.value, 0);
  async function addAccount(f: FormData) {
    "use server";
    await createPortfolioAccount({
      name: String(f.get("name") ?? ""),
      baseCurrency: String(f.get("base_currency") ?? ""),
    });
    revalidatePath("/portfolio");
  }
  async function addTransaction(f: FormData) {
    "use server";
    await appendPortfolioTransaction({
      accountId: String(f.get("account_id") ?? ""),
      type: String(f.get("type") ?? ""),
      symbol: String(f.get("symbol") ?? ""),
      quantity: n(f, "quantity"),
      unitPrice: n(f, "unit_price"),
      fee: n(f, "fee"),
      executedAt: String(f.get("executed_at") ?? ""),
      notes: String(f.get("notes") ?? ""),
    });
    revalidatePath("/portfolio");
  }
  return (
    <Shell current="portfolio">
      <header className="page-head">
        <div>
          <span className="overline">Capital allocation / portfolio truth</span>
          <h1>Portfolioledger</h1>
          <p>
            Immutable transacties vormen de bron voor holdings en toekomstige
            point-in-time snapshots.
          </p>
        </div>
        <div className="asof">
          Valuation<strong>USD actief · EUR geblokkeerd</strong>
        </div>
      </header>
      <section className="journal-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="overline">Exposure & concentration</span>
              <h2>Actuele risicoblootstelling</h2>
            </div>
            <span>
              {total
                ? `${total.toLocaleString("nl-NL", { maximumFractionDigits: 0 })} USD`
                : "prijzen ontbreken"}
            </span>
          </div>
          {exposures.map((x) => (
            <article
              className="journal-entry"
              key={`${x.account_id}-${x.symbol}`}
            >
              <div>
                <strong>{x.symbol}</strong>
                <span>
                  {total ? `${((x.value / total) * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
              <p>
                {x.symbol === "CASH"
                  ? "liquiditeit / lage beta"
                  : x.symbol === "BTC"
                    ? "crypto monetary asset / hoge beta"
                    : "smart-contract ecosystem / hoge gecorreleerde beta"}
              </p>
            </article>
          ))}
          <p className="validation-warning">
            BTC/ETH-correlatie, beta, stressverlies en HHI worden point-in-time
            berekend in de allocation cockpit. Providerconcentratie staat onder
            Trust.
          </p>
        </section>
        <div>
          <form action={addAccount} className="panel journal-form">
            <div className="panel-head">
              <div>
                <span className="overline">Account</span>
                <h2>Nieuw handmatig account</h2>
              </div>
            </div>
            <label>
              Naam
              <input name="name" minLength={2} required />
            </label>
            <label>
              Basisvaluta
              <select name="base_currency">
                <option>USD</option>
                <option>EUR</option>
              </select>
            </label>
            <button className="text-button">Account maken</button>
            <Link className="text-link" href="/portfolio/import">
              CSV import en reconciliatie →
            </Link>
          </form>
          <form
            action={addTransaction}
            className="panel journal-form mandate-benchmarks"
          >
            <div className="panel-head">
              <div>
                <span className="overline">Append-only</span>
                <h2>Transactie vastleggen</h2>
              </div>
            </div>
            <label>
              Account
              <select name="account_id" required>
                {accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name} · {a.base_currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select name="type">
                <option>DEPOSIT</option>
                <option>WITHDRAWAL</option>
                <option>BUY</option>
                <option>SELL</option>
                <option>FEE</option>
              </select>
            </label>
            <label>
              Asset
              <select name="symbol">
                <option>BTC</option>
                <option>ETH</option>
                <option>CASH</option>
              </select>
            </label>
            <label>
              Hoeveelheid
              <input
                name="quantity"
                type="number"
                min="0.00000001"
                step="any"
                required
              />
            </label>
            <label>
              Prijs per asset in basisvaluta
              <input
                name="unit_price"
                type="number"
                min="0"
                step="any"
                defaultValue="0"
                required
              />
            </label>
            <label>
              Fee in basisvaluta
              <input
                name="fee"
                type="number"
                min="0"
                step="any"
                defaultValue="0"
                required
              />
            </label>
            <label>
              Uitgevoerd op
              <input name="executed_at" type="datetime-local" required />
            </label>
            <label>
              Notitie
              <input name="notes" />
            </label>
            <button className="text-button" disabled={!accounts.length}>
              Transactie toevoegen
            </button>
          </form>
        </div>
        <div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="overline">Current ledger balance</span>
                <h2>Holdings</h2>
              </div>
            </div>
            {accounts.map((a) => (
              <article className="journal-entry" key={a.id}>
                <div>
                  <strong>{a.name}</strong>
                  <time>{a.base_currency}</time>
                </div>
                {holdings
                  .filter((h) => h.account_id === a.id)
                  .map((h) => (
                    <p key={h.symbol}>
                      {h.symbol}:{" "}
                      {h.quantity.toLocaleString("nl-NL", {
                        maximumFractionDigits: 8,
                      })}
                    </p>
                  ))}
              </article>
            ))}
            {!accounts.length && (
              <p className="muted">Nog geen portfolioaccount.</p>
            )}
          </section>
          <section className="panel mandate-benchmarks">
            <div className="panel-head">
              <div>
                <span className="overline">Audit trail</span>
                <h2>Laatste transacties</h2>
              </div>
            </div>
            {transactions.map((t) => (
              <article className="journal-entry" key={t.id}>
                <div>
                  <span className="warning-badge">{t.transaction_type}</span>
                  <strong>
                    {t.symbol} · {t.quantity}
                  </strong>
                  <time>{new Date(t.executed_at).toLocaleString("nl-NL")}</time>
                </div>
                <p>
                  {t.portfolio_accounts?.name} · prijs {t.unit_price} · fee{" "}
                  {t.fee}
                </p>
              </article>
            ))}
          </section>
        </div>
      </section>
    </Shell>
  );
}
