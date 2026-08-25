import { revalidatePath } from "next/cache";
import { addCatalyst, addThesisEvidence, reviewQueue } from "../../lib/data";
import { Shell } from "../ui/shell";
type Thesis = {
  id: string;
  assets: { symbol: string } | null;
  review_on: string;
};
type Event = {
  id: string;
  severity: string;
  event_type: string;
  details: unknown;
};
type Recommendation = {
  id: string;
  status: string;
  calculated_at: string;
  analyst_signoffs: Array<{ id: string }>;
};
type Catalyst = {
  id: string;
  assets: { symbol: string } | null;
  title: string;
  event_at: string;
  event_type: string;
};

export default async function ReviewsPage() {
  const q = await reviewQueue();
  async function add(f: FormData) {
    "use server";
    await addCatalyst({
      symbol: String(f.get("symbol")),
      type: String(f.get("type")),
      title: String(f.get("title")),
      eventAt: String(f.get("event_at")),
      sourceUrl: String(f.get("source_url") ?? ""),
    });
    revalidatePath("/reviews");
  }
  async function evidence(f: FormData) {
    "use server";
    await addThesisEvidence({
      thesisId: String(f.get("thesis_id")),
      classification: String(f.get("classification")),
      fact: String(f.get("fact")),
      sourceUrl: String(f.get("source_url") ?? ""),
    });
    revalidatePath("/reviews");
  }
  return (
    <Shell current="reviews">
      <header className="page-head">
        <div>
          <span className="overline">Human control plane</span>
          <h1>Review queue</h1>
          <p>
            Mandaatbreuken, verlopen theses, freezes, dataproblemen en catalysts
            vragen menselijke beoordeling; niets plaatst orders.
          </p>
        </div>
        <div className="asof">
          Open items
          <strong>
            {q.theses.length +
              q.events.length +
              (q.recommendations as Recommendation[]).filter(
                (r) => !r.analyst_signoffs?.length,
              ).length}
          </strong>
        </div>
      </header>
      <section className="journal-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Actie vereist</h2>
          </div>
          {(q.theses as Thesis[]).map((x) => (
            <article className="journal-entry" key={x.id}>
              <strong>Thesis review · {x.assets?.symbol}</strong>
              <p>Vervallen op {x.review_on}</p>
            </article>
          ))}
          {(q.events as Event[]).map((x) => (
            <article className="journal-entry" key={x.id}>
              <strong>
                {x.severity} · {x.event_type}
              </strong>
              <p>{JSON.stringify(x.details)}</p>
            </article>
          ))}
          {(q.recommendations as Recommendation[])
            .filter((x) => !x.analyst_signoffs?.length)
            .map((x) => (
              <article className="journal-entry" key={x.id}>
                <strong>Allocatie wacht op sign-off</strong>
                <p>
                  {x.status} ·{" "}
                  {new Date(x.calculated_at).toLocaleString("nl-NL")}
                </p>
              </article>
            ))}
        </section>
        <form action={add} className="panel journal-form">
          <div className="panel-head">
            <h2>Catalyst toevoegen</h2>
          </div>
          <label>
            Asset
            <select name="symbol">
              <option>BTC</option>
              <option>ETH</option>
            </select>
          </label>
          <label>
            Type
            <input name="type" placeholder="FOMC, CPI, UPGRADE, ETF" required />
          </label>
          <label>
            Titel
            <input name="title" minLength={5} required />
          </label>
          <label>
            Datum en tijd
            <input name="event_at" type="datetime-local" required />
          </label>
          <label>
            Bron-URL
            <input name="source_url" type="url" />
          </label>
          <button className="text-button">Plan review-event</button>
        </form>
      </section>
      <form action={evidence} className="panel journal-form mandate-benchmarks">
        <div className="panel-head">
          <h2>Thesisbewijs classificeren</h2>
        </div>
        <label>
          Actieve thesis
          <select name="thesis_id" required>
            {(q.theses as Thesis[]).map((x) => (
              <option key={x.id} value={x.id}>
                {x.assets?.symbol} · review {x.review_on}
              </option>
            ))}
          </select>
        </label>
        <label>
          Classificatie
          <select name="classification">
            <option>SUPPORTING</option>
            <option>CONTRADICTING</option>
            <option>IRRELEVANT</option>
            <option>HARD_INVALIDATOR</option>
          </select>
        </label>
        <label>
          Deterministisch feit / JSON
          <textarea name="fact" minLength={10} required />
        </label>
        <label>
          Bron-URL
          <input name="source_url" type="url" />
        </label>
        <p className="validation-warning">
          HARD_INVALIDATOR bevriest nieuwe exposure in de volgende
          allocatiecyclus. Narratieve AI mag deze classificatie niet wijzigen.
        </p>
        <button className="text-button" disabled={!q.theses.length}>
          Bewijs opslaan
        </button>
      </form>
      <section className="panel">
        <div className="panel-head">
          <h2>Komende catalysts</h2>
        </div>
        {(q.catalysts as Catalyst[]).map((x) => (
          <article className="journal-entry" key={x.id}>
            <div>
              <strong>
                {x.assets?.symbol ?? "PORTFOLIO"} · {x.title}
              </strong>
              <time>{new Date(x.event_at).toLocaleString("nl-NL")}</time>
            </div>
            <p>{x.event_type} · event creëert nooit automatisch een trade</p>
          </article>
        ))}
      </section>
    </Shell>
  );
}
