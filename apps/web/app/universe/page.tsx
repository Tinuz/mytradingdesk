import { revalidatePath } from "next/cache";
import {
  addReadOnlyConnector,
  portfolioOverview,
  universeWorkspace,
} from "../../lib/data";
import { Shell } from "../ui/shell";
export default async function UniversePage() {
  const [w, p] = await Promise.all([universeWorkspace(), portfolioOverview()]);
  async function add(f: FormData) {
    "use server";
    await addReadOnlyConnector({
      accountId: String(f.get("account_id")),
      provider: String(f.get("provider")),
      credentialReference: String(f.get("credential_reference")),
    });
    revalidatePath("/universe");
  }
  return (
    <Shell current="universe">
      <header className="page-head">
        <div>
          <span className="overline">Investable universe</span>
          <h1>Asset admission en read-only koppelingen</h1>
          <p>
            Prijsdata alleen is nooit genoeg. Toelating vereist liquiditeit,
            custody, historie, brondekking, fundamenteel model en
            exitcapaciteit.
          </p>
        </div>
      </header>
      <section className="journal-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Admission reviews</h2>
          </div>
          {w.reviews.map((x: Record<string, unknown>) => (
            <article className="journal-entry" key={String(x.id)}>
              <div>
                <strong>{String(x.symbol)}</strong>
                <span
                  className={
                    x.status === "ADMITTED" ? "status-badge" : "warning-badge"
                  }
                >
                  {String(x.status)}
                </span>
              </div>
              <p>{String(x.rationale)}</p>
            </article>
          ))}
          {!w.reviews.length && (
            <p className="muted">
              Geen extra assets toegelaten; BTC/ETH blijven de bevroren
              V1-universe.
            </p>
          )}
          <h3>L1 relative-value framework</h3>
          <p>
            Economische activiteit, retentie, developertraction, flows,
            incentives, securitykosten, dilution en token value accrual worden
            afzonderlijk beoordeeld. Netwerkgebruik wordt nooit automatisch
            tokenrendement.
          </p>
        </section>
        <form action={add} className="panel journal-form">
          <div className="panel-head">
            <h2>Read-only connector registreren</h2>
          </div>
          <label>
            Ledgeraccount
            <select name="account_id" required>
              {p.accounts.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Provider
            <input name="provider" placeholder="Exchange of broker" required />
          </label>
          <label>
            Secret-manager reference
            <input
              name="credential_reference"
              placeholder="vault://... (geen API-secret)"
              required
            />
          </label>
          <p className="validation-warning">
            De app bewaart alleen een referentie. Trade en withdrawal zijn
            database-technisch false; de connector start DISABLED en handmatige
            ledger blijft leidend.
          </p>
          <button className="text-button" disabled={!p.accounts.length}>
            Registreren
          </button>
          {w.connectors.map((x: Record<string, unknown>) => (
            <article className="journal-entry" key={String(x.id)}>
              <strong>
                {String(x.provider)} · {String(x.status)}
              </strong>
              <p>
                read-only · laatste sync {String(x.last_sync_at ?? "nooit")}
              </p>
            </article>
          ))}
        </form>
      </section>
    </Shell>
  );
}
