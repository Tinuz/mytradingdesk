import { revalidatePath } from "next/cache";
import {
  allocationWorkspace,
  appendAssetThesis,
  appendScenarioSet,
} from "../../lib/data";
import { Shell } from "../ui/shell";
import { ScenarioPreview } from "../allocation/scenario-preview";
const n = (f: FormData, k: string) => Number(f.get(k));
export default async function WorkbenchPage() {
  const w = await allocationWorkspace();
  async function thesis(f: FormData) {
    "use server";
    await appendAssetThesis({
      symbol: String(f.get("symbol")),
      thesis: String(f.get("thesis")),
      drivers: String(f.get("drivers")),
      counterThesis: String(f.get("counter_thesis")),
      invalidators: String(f.get("invalidators")),
      reviewOn: String(f.get("review_on")),
      conviction: String(f.get("conviction")),
    });
    revalidatePath("/workbench");
  }
  async function scenario(f: FormData) {
    "use server";
    await appendScenarioSet({
      symbol: String(f.get("symbol")),
      horizon: n(f, "horizon"),
      bearProbability: n(f, "bear_probability"),
      baseProbability: n(f, "base_probability"),
      bullProbability: n(f, "bull_probability"),
      bearTarget: n(f, "bear_target"),
      baseTarget: n(f, "base_target"),
      bullTarget: n(f, "bull_target"),
    });
    revalidatePath("/workbench");
  }
  return (
    <Shell current="workbench">
      <header className="page-head">
        <div>
          <span className="overline">Geavanceerde analistenlaag</span>
          <h1>Thesis- en scenariowerkbank</h1>
          <p>
            Versiebeheer aannames afzonderlijk van dagelijkse recommendations.
            Wijzigingen herschrijven nooit historie.
          </p>
        </div>
      </header>
      <ScenarioPreview />
      <section className="journal-grid">
        <form action={thesis} className="panel journal-form">
          <div className="panel-head">
            <h2>Nieuwe thesisversie</h2>
          </div>
          <label>
            Asset
            <select name="symbol">
              <option>BTC</option>
              <option>ETH</option>
            </select>
          </label>
          <label>
            Causale thesis
            <textarea name="thesis" minLength={20} required />
          </label>
          <label>
            Drivers, één per regel
            <textarea name="drivers" required />
          </label>
          <label>
            Counter-thesis
            <textarea name="counter_thesis" required />
          </label>
          <label>
            Harde invalidators, één per regel
            <textarea name="invalidators" required />
          </label>
          <label>
            Convictie
            <select name="conviction">
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
            </select>
          </label>
          <label>
            Verplichte review
            <input name="review_on" type="date" required />
          </label>
          <button className="text-button">Immutable versie opslaan</button>
        </form>
        <form action={scenario} className="panel journal-form">
          <div className="panel-head">
            <h2>Bull/base/bear verdeling</h2>
          </div>
          <label>
            Asset
            <select name="symbol">
              <option>BTC</option>
              <option>ETH</option>
            </select>
          </label>
          <label>
            Horizon maanden
            <input
              name="horizon"
              type="number"
              defaultValue="12"
              min="1"
              required
            />
          </label>
          {[
            ["Bear", "bear", 20],
            ["Base", "base", 50],
            ["Bull", "bull", 30],
          ].map(([label, key, p]) => (
            <fieldset key={String(key)}>
              <legend>{label}</legend>
              <label>
                Analistenkans %
                <input
                  name={`${key}_probability`}
                  type="number"
                  defaultValue={p}
                  min="0"
                  max="100"
                  required
                />
              </label>
              <label>
                Koersdoel
                <input
                  name={`${key}_target`}
                  type="number"
                  min="0.01"
                  step="any"
                  required
                />
              </label>
            </fieldset>
          ))}
          <p className="validation-warning">
            Kansen moeten samen exact 100% zijn en zijn niet gekalibreerd totdat
            voldoende prospective outcomes bestaan.
          </p>
          <button className="text-button">Scenarioversie opslaan</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Actieve analyst inputs</h2>
        </div>
        {w.theses.map((x: Record<string, unknown>) => (
          <article className="journal-entry" key={String(x.id)}>
            <strong>
              {String((x.assets as { symbol: string })?.symbol)} · thesis{" "}
              {String(x.analyst_conviction)}
            </strong>
            <p>{String(x.thesis)}</p>
          </article>
        ))}
      </section>
    </Shell>
  );
}
