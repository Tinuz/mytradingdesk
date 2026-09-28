import { revalidatePath } from "next/cache";
import { addJournalEntry, decisions, journalEntries } from "../../lib/data";
import { Shell } from "../ui/shell";
const pretty = (value: string) => value.toLowerCase().replaceAll("_", " ");
export default async function JournalPage() {
  const [snapshots, entries] = await Promise.all([
    decisions(10),
    journalEntries(),
  ]);
  const latest = snapshots.filter(
    (row, index, list) =>
      list.findIndex((item) => item.symbol === row.symbol) === index,
  );
  async function save(formData: FormData) {
    "use server";
    await addJournalEntry({
      decisionId: String(formData.get("decision_id") ?? ""),
      entryType: String(formData.get("entry_type") ?? ""),
      humanAction: String(formData.get("human_action") ?? ""),
      thesis: String(formData.get("thesis") ?? ""),
      invalidatingEvidence: String(formData.get("invalidating_evidence") ?? ""),
      reviewOn: String(formData.get("review_on") ?? ""),
    });
    revalidatePath("/journal");
  }
  return (
    <Shell current="journal">
      <header className="page-head">
        <div>
          <span className="overline">Gate 5 / human decision layer</span>
          <h1>Investeerdersjournal</h1>
          <p>
            Leg je eigen keuze vast zonder die te verwarren met de
            modelclassificatie.
          </p>
        </div>
        <div className="asof">
          Protocol<strong>Observeer → beslis → toets</strong>
        </div>
      </header>
      <section className="journal-grid">
        <form action={save} className="panel journal-form">
          <div className="panel-head">
            <div>
              <span className="overline">Nieuwe notitie</span>
              <h2>Expliciet besluit</h2>
            </div>
          </div>
          <label>
            Modelsnapshot
            <select name="decision_id" required>
              {latest.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.symbol} · {pretty(row.decision_state)} ·{" "}
                  {new Date(row.calculated_at).toLocaleDateString("nl-NL")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select name="entry_type">
              <option>OBSERVATION</option>
              <option>DECISION</option>
              <option>REVIEW</option>
            </select>
          </label>
          <label>
            Eigen actie
            <select name="human_action">
              <option>NO_ACTION</option>
              <option>REVIEW_ONLY</option>
              <option>ADD_CAPITAL</option>
              <option>REDUCE_RISK</option>
            </select>
          </label>
          <label>
            Thesis
            <textarea
              name="thesis"
              minLength={10}
              required
              placeholder="Waarom is dit besluit rationeel, gegeven de huidige informatie?"
            />
          </label>
          <label>
            Wat maakt de thesis ongeldig?
            <textarea
              name="invalidating_evidence"
              placeholder="Concreet signaal of niveau dat je oordeel verandert."
            />
          </label>
          <label>
            Herbeoordelen op
            <input name="review_on" type="date" />
          </label>
          <button
            className="text-button"
            type="submit"
            disabled={!latest.length}
          >
            Vastleggen
          </button>
        </form>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="overline">Audit trail</span>
              <h2>{entries.length} journalregels</h2>
            </div>
          </div>
          {entries.map((entry) => (
            <article className="journal-entry" key={entry.id}>
              <div>
                <span className="warning-badge">{entry.entry_type}</span>
                <strong>
                  {entry.assets?.symbol ?? "—"} · {pretty(entry.human_action)}
                </strong>
                <time>
                  {new Date(entry.created_at).toLocaleString("nl-NL")}
                </time>
              </div>
              <p>{entry.thesis}</p>
              {entry.invalidating_evidence && (
                <small>Ongeldig wanneer: {entry.invalidating_evidence}</small>
              )}
            </article>
          ))}
          {!entries.length && (
            <p className="muted">
              Nog geen menselijke beslissingen vastgelegd.
            </p>
          )}
        </section>
      </section>
    </Shell>
  );
}
