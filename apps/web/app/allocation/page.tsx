import { revalidatePath } from "next/cache";
import {
  allocationWorkspace,
  appendAssetThesis,
  appendScenarioSet,
  signoffRecommendation,
} from "../../lib/data";
import { Shell } from "../ui/shell";
import { ScenarioPreview } from "./scenario-preview";
const num = (f: FormData, k: string) => Number(f.get(k));
export default async function AllocationPage() {
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
    revalidatePath("/allocation");
  }
  async function scenario(f: FormData) {
    "use server";
    await appendScenarioSet({
      symbol: String(f.get("symbol")),
      horizon: num(f, "horizon"),
      bearProbability: num(f, "bear_probability"),
      baseProbability: num(f, "base_probability"),
      bullProbability: num(f, "bull_probability"),
      bearTarget: num(f, "bear_target"),
      baseTarget: num(f, "base_target"),
      bullTarget: num(f, "bull_target"),
    });
    revalidatePath("/allocation");
  }
  async function signoff(f: FormData) {
    "use server";
    const rawTargets = String(f.get("modified_targets") ?? "").trim();
    const allowedAssets = new Set(
      ((w.mandate?.allowed_assets ?? ["BTC", "ETH"]) as string[]).filter(
        (asset) => ["BTC", "ETH"].includes(asset),
      ),
    );
    const guidedTargets = Object.fromEntries(
      ["BTC", "ETH"]
        .filter((asset) => allowedAssets.has(asset))
        .map((asset) => [
          asset,
          {
            minimum: Number(f.get(`${asset.toLowerCase()}_minimum`)),
            maximum: Number(f.get(`${asset.toLowerCase()}_maximum`)),
          },
        ]),
    );
    await signoffRecommendation({
      recommendationId: String(f.get("recommendation_id")),
      action: String(f.get("action")),
      rationale: String(f.get("rationale")),
      modifiedTargets: rawTargets || JSON.stringify(guidedTargets),
      reviewOn: String(f.get("review_on") ?? ""),
    });
    revalidatePath("/allocation");
  }
  const r = w.recommendation,
    targets = (r?.target_ranges ?? {}) as Record<
      string,
      { minimum: number; maximum: number; midpoint: number }
    >,
    snapshot = w.snapshot as {
      positions?: Record<string, { value?: number }>;
      total_value?: number;
    } | null,
    snapshotTotal = Number(snapshot?.total_value ?? 0),
    currentWeights = Object.fromEntries(
      ["BTC", "ETH", "CASH"].map((asset) => [
        asset,
        snapshotTotal > 0
          ? (Number(snapshot?.positions?.[asset]?.value ?? 0) / snapshotTotal) *
            100
          : null,
      ]),
    ) as Record<string, number | null>,
    latestSignoff = (
      w.signoffs as Array<{
        recommendation_id?: string;
        action?: string;
        rationale?: string;
      }>
    ).find((signoff) => signoff.recommendation_id === r?.id),
    scenarioRows =
      (w.scenarios as Array<{
        id: string;
        scenarios: Array<{ name: string; returnPercent: number }>;
        assets?: { symbol: string };
      }>) ?? [],
    portfolioScenarios = ["BEAR", "BASE", "BULL"].map((name) => ({
      name,
      returnPercent: scenarioRows.reduce((sum, set) => {
        const symbol = set.assets?.symbol ?? "BTC",
          weight = (targets[symbol]?.midpoint ?? 0) / 100,
          scenario = set.scenarios.find((x) => x.name === name);
        return sum + weight * Number(scenario?.returnPercent ?? 0);
      }, 0),
    }));
  return (
    <Shell current="allocation">
      <header className="page-head">
        <div>
          <span className="overline">Shadow capital allocation</span>
          <h1>Allocation cockpit</h1>
          <p>
            Regime, waardering, thesis, scenario en mandaat worden hier
            samengebracht zonder orderuitvoering.
          </p>
        </div>
        <div className="asof">
          Evidence
          <strong>{String(r?.evidence_status ?? "NO RECOMMENDATION")}</strong>
          <span>
            data {String(r?.data_confidence ?? "LOW")} · model{" "}
            {String(r?.model_evidence_status ?? "SHADOW")}
          </span>
        </div>
      </header>
      <section
        className={`next-action ${!r || r.status !== "AVAILABLE" ? "warning" : ""}`}
      >
        <div>
          <span className="overline">Wat vraagt dit van jou?</span>
          <h2>
            {!r
              ? "Wacht op de eerste modelcyclus"
              : r.status === "AVAILABLE"
                ? "Beoordeel een mogelijke paperwijziging"
                : r.status === "FROZEN"
                  ? "Verhoog exposure niet"
                  : "Geen geldige doelverdeling"}
          </h2>
          <p>
            {!r
              ? "Zonder recommendation is er niets te beoordelen."
              : r.status === "AVAILABLE"
                ? "Vergelijk je huidige positie met de targetrange, lees scenarioverlies en invalidators en kies daarna zelf Approve, Modify, Reject of Defer."
                : "De app vraagt geen nieuwe exposure zolang een bron, thesis, waardering, operationele controle of mandaatconstraint blokkeert."}
          </p>
        </div>
        {r?.status === "AVAILABLE" && (
          <a className="primary-action" href="#human-review">
            Start beoordeling
          </a>
        )}
      </section>
      {!w.mandate && (
        <section className="trust-banner stale">
          <strong>BLOCKED</strong>
          <span>Maak eerst een immutable investormandaat aan.</span>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="overline">Latest policy output</span>
            <h2>{String(r?.status ?? "Nog niet berekend")}</h2>
          </div>
          <span>{String(r?.allocation_policy_version ?? "—")}</span>
        </div>
        <div className="horizon-grid">
          {["BTC", "ETH", "CASH"].map((x) => (
            <div key={x}>
              <small>{x} huidige positie → doelband</small>
              <strong>
                {targets[x] && currentWeights[x] !== null
                  ? `${currentWeights[x]!.toFixed(1)}% → ${targets[x].minimum}%–${targets[x].maximum}%`
                  : targets[x]
                    ? `${targets[x].minimum}%–${targets[x].maximum}%`
                    : "—"}
              </strong>
              <span>
                {targets[x]
                  ? currentWeights[x] === null
                    ? `doelpunt ${targets[x].midpoint}% · huidige positie ontbreekt`
                    : currentWeights[x]! < targets[x].minimum
                      ? "onder de doelband · mogelijke verhoging beoordelen"
                      : currentWeights[x]! > targets[x].maximum
                        ? "boven de doelband · risicoverlaging beoordelen"
                        : "binnen de doelband · geen aanpassing nodig"
                  : "Geen output"}
              </span>
            </div>
          ))}
        </div>
        {r && latestSignoff && (
          <div className="trust-banner">
            <strong>Laatst vastgelegd: {latestSignoff.action}</strong>
            <span>{latestSignoff.rationale}</span>
          </div>
        )}
        {r && (
          <form
            id="human-review"
            action={signoff}
            className="journal-form mandate-benchmarks"
          >
            <input
              type="hidden"
              name="recommendation_id"
              value={String(r.id)}
            />
            <label>
              Menselijke beoordeling
              <select name="action">
                <option>APPROVE</option>
                <option>MODIFY</option>
                <option>REJECT</option>
                <option>DEFER</option>
              </select>
            </label>
            <label>
              Rationale
              <textarea
                name="rationale"
                minLength={10}
                required
                placeholder="Welke feiten, risico's en grenzen bepalen je keuze?"
              />
            </label>
            <fieldset>
              <legend>Eigen doelbanden (alleen gebruikt bij MODIFY)</legend>
              {(["BTC", "ETH"] as const).map((asset) => (
                <div className="range-inputs" key={asset}>
                  <strong>{asset}</strong>
                  <label>
                    Minimum %
                    <input
                      name={`${asset.toLowerCase()}_minimum`}
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      defaultValue={targets[asset]?.minimum ?? 0}
                    />
                  </label>
                  <label>
                    Maximum %
                    <input
                      name={`${asset.toLowerCase()}_maximum`}
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      defaultValue={targets[asset]?.maximum ?? 0}
                    />
                  </label>
                </div>
              ))}
              <small>
                De cashvloer en maximumweging uit je mandaat worden bij opslaan
                opnieuw gecontroleerd.
              </small>
            </fieldset>
            <label className="advanced-only">
              Geavanceerde target-override (JSON, optioneel)
              <textarea
                name="modified_targets"
                placeholder='{"BTC":{"minimum":20,"maximum":30}}'
              />
            </label>
            <label>
              Nieuwe reviewdatum
              <input name="review_on" type="date" />
            </label>
            <button className="text-button">Sign-off vastleggen</button>
          </form>
        )}
      </section>
      <ScenarioPreview />
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="overline">Scenario lab</span>
            <h2>Hypothetisch portefeuilleeffect</h2>
          </div>
          <span>geen wijziging van aanbeveling</span>
        </div>
        <div className="horizon-grid">
          {portfolioScenarios.map((x) => (
            <div key={x.name}>
              <small>{x.name}</small>
              <strong>{x.returnPercent.toFixed(1)}%</strong>
              <span>vóór additionele liquiditeitsimpact</span>
            </div>
          ))}
        </div>
        <p className="validation-warning">
          Gebaseerd op analyst-scenario’s en target midpoints;
          transactiekosten/slippage worden in de paper engine verwerkt. Dit is
          geen voorspelling.
        </p>
      </section>
      <section className="journal-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="overline">Risk capacity</span>
              <h2>Point-in-time portefeuille-risico</h2>
            </div>
            <span>{String(w.risk?.methodology_version ?? "MISSING")}</span>
          </div>
          {w.risk ? (
            <div className="horizon-grid">
              {Object.entries((w.risk.metrics ?? {}) as Record<string, unknown>)
                .slice(0, 6)
                .map(([k, v]) => (
                  <div key={k}>
                    <small>{k}</small>
                    <strong>
                      {v === null ? "onvoldoende data" : String(v)}
                    </strong>
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted">
              Geen portefeuille-snapshot; risicocapaciteit blijft onbekend.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="overline">Prospective proof</span>
              <h2>Paper portfolio en capital gate</h2>
            </div>
            <span>{String(w.readiness?.status ?? "BLOCKED")}</span>
          </div>
          <p>
            Paper NAV:{" "}
            {w.paper
              ? Number(w.paper.nav).toLocaleString("nl-NL")
              : "nog niet gestart"}
          </p>
          <p>
            Protocol vereist minimaal zes maanden prospective evidence en nul
            kritieke integriteitsdefecten.
          </p>
          <p className="validation-warning">
            Een geslaagde gate activeert alleen LIVE_DECISION_SUPPORT, nooit
            orderuitvoering.
          </p>
        </section>
      </section>
      {r && (
        <section
          className={`trust-banner ${r.status === "AVAILABLE" ? "" : "stale"}`}
        >
          <strong>{String(r.status)}</strong>
          <span>
            {((r.warnings ?? []) as string[]).join(" · ") ||
              "Geen actieve waarschuwingen"}
          </span>
        </section>
      )}
      <section className="journal-grid advanced-only">
        <form action={thesis} className="panel journal-form">
          <div className="panel-head">
            <div>
              <span className="overline">CAS-040</span>
              <h2>Nieuwe thesisversie</h2>
            </div>
          </div>
          <label>
            Asset
            <select name="symbol">
              <option>BTC</option>
              <option>ETH</option>
            </select>
          </label>
          <label>
            Thesis
            <textarea name="thesis" minLength={20} required />
          </label>
          <label>
            Causale drivers, één per regel
            <textarea name="drivers" required />
          </label>
          <label>
            Counter-thesis
            <textarea name="counter_thesis" required />
          </label>
          <label>
            Invalidators, één per regel
            <textarea name="invalidators" required />
          </label>
          <label>
            Reviewdatum
            <input type="date" name="review_on" required />
          </label>
          <label>
            Analistconvictie
            <select name="conviction">
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
            </select>
          </label>
          <button className="text-button">Immutable thesis opslaan</button>
        </form>
        <form action={scenario} className="panel journal-form">
          <div className="panel-head">
            <div>
              <span className="overline">CAS-041/042</span>
              <h2>Bull/base/bear scenario</h2>
            </div>
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
              type="number"
              name="horizon"
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
                Kans %
                <input
                  type="number"
                  name={`${key}_probability`}
                  defaultValue={p}
                  min="0"
                  max="100"
                  required
                />
              </label>
              <label>
                Koersdoel
                <input
                  type="number"
                  name={`${key}_target`}
                  min="0.01"
                  step="any"
                  required
                />
              </label>
            </fieldset>
          ))}
          <p className="validation-warning">
            Waarschijnlijkheden moeten exact 100% zijn. Dit zijn
            analistaannames, geen gekalibreerde kansen.
          </p>
          <button className="text-button">Scenarioset opslaan</button>
        </form>
      </section>
    </Shell>
  );
}
