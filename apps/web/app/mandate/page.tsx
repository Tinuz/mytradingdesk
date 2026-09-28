import { revalidatePath } from "next/cache";
import {
  appendInvestorMandate,
  benchmarkDefinitions,
  currentInvestorMandate,
} from "../../lib/data";
import { Shell } from "../ui/shell";
import { label } from "../ui/labels";

const number = (data: FormData, key: string) => Number(data.get(key));

export default async function MandatePage() {
  const [mandate, benchmarks] = await Promise.all([
    currentInvestorMandate(),
    benchmarkDefinitions(),
  ]);
  async function save(formData: FormData) {
    "use server";
    await appendInvestorMandate({
      baseCurrency: String(formData.get("base_currency") ?? ""),
      objective: String(formData.get("objective") ?? ""),
      horizonMonths: number(formData, "horizon_months"),
      maximumDrawdownPercent: number(formData, "maximum_drawdown_percent"),
      minimumCashPercent: number(formData, "minimum_cash_percent"),
      maximumAssetWeightPercent: number(
        formData,
        "maximum_asset_weight_percent",
      ),
      annualTurnoverBudgetPercent: number(
        formData,
        "annual_turnover_budget_percent",
      ),
      rebalanceCadence: String(formData.get("rebalance_cadence") ?? ""),
      allowedAssets: formData.getAll("allowed_assets").map(String),
    });
    revalidatePath("/mandate");
  }
  return (
    <Shell current="mandate">
      <header className="page-head">
        <div>
          <span className="overline">Capital allocation / foundation</span>
          <h1>Investeerdersmandaat</h1>
          <p>
            Leg de grenzen vast waarbinnen toekomstige shadow-allocaties mogen
            worden berekend.
          </p>
        </div>
        <div className="asof">
          Status<strong>SHADOW · GEEN EXECUTIE</strong>
        </div>
      </header>
      <section className="journal-grid">
        <form action={save} className="panel journal-form">
          <div className="panel-head">
            <div>
              <span className="overline">Nieuwe immutable versie</span>
              <h2>Mandaatgrenzen</h2>
            </div>
          </div>
          <label>
            Basisvaluta
            <select
              name="base_currency"
              defaultValue={mandate?.base_currency ?? "EUR"}
            >
              <option>EUR</option>
              <option>USD</option>
            </select>
          </label>
          <label>
            Doelstelling
            <select
              name="objective"
              defaultValue={mandate?.objective ?? "BALANCED"}
            >
              <option value="CAPITAL_PRESERVATION">Kapitaalbehoud</option>
              <option value="BALANCED">Gebalanceerd</option>
              <option value="GROWTH">Groei</option>
            </select>
          </label>
          <label>
            Beleggingshorizon in maanden
            <input
              name="horizon_months"
              type="number"
              min="3"
              max="240"
              defaultValue={mandate?.horizon_months ?? 36}
              required
            />
          </label>
          <label>
            Maximale drawdown (%)
            <input
              name="maximum_drawdown_percent"
              type="number"
              min="1"
              max="80"
              step="0.5"
              defaultValue={mandate?.maximum_drawdown_percent ?? 25}
              required
            />
          </label>
          <label>
            Minimale cashpositie (%)
            <input
              name="minimum_cash_percent"
              type="number"
              min="0"
              max="99"
              step="0.5"
              defaultValue={mandate?.minimum_cash_percent ?? 10}
              required
            />
          </label>
          <label>
            Maximaal gewicht per asset (%)
            <input
              name="maximum_asset_weight_percent"
              type="number"
              min="1"
              max="100"
              step="0.5"
              defaultValue={mandate?.maximum_asset_weight_percent ?? 70}
              required
            />
          </label>
          <label>
            Jaarlijks turnoverbudget (%)
            <input
              name="annual_turnover_budget_percent"
              type="number"
              min="0"
              max="2000"
              step="1"
              defaultValue={mandate?.annual_turnover_budget_percent ?? 200}
              required
            />
          </label>
          <label>
            Herbalanceerfrequentie
            <select
              name="rebalance_cadence"
              defaultValue={mandate?.rebalance_cadence ?? "MONTHLY"}
            >
              <option value="WEEKLY">Wekelijks</option>
              <option value="MONTHLY">Maandelijks</option>
              <option value="QUARTERLY">Per kwartaal</option>
            </select>
          </label>
          <fieldset>
            <legend>Toegestane assets</legend>
            <label>
              <input
                type="checkbox"
                name="allowed_assets"
                value="BTC"
                defaultChecked={
                  !mandate || mandate.allowed_assets.includes("BTC")
                }
              />{" "}
              BTC
            </label>
            <label>
              <input
                type="checkbox"
                name="allowed_assets"
                value="ETH"
                defaultChecked={
                  !mandate || mandate.allowed_assets.includes("ETH")
                }
              />{" "}
              ETH
            </label>
          </fieldset>
          <p className="validation-warning">
            Opslaan maakt een nieuwe versie. Bestaande versies worden nooit
            gewijzigd, zodat historische aanbevelingen reproduceerbaar blijven.
          </p>
          <button className="text-button" type="submit">
            Nieuwe mandaatversie vastleggen
          </button>
        </form>
        <div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="overline">Actieve versie</span>
                <h2>
                  {mandate
                    ? `Geldig sinds ${new Date(mandate.effective_at).toLocaleDateString("nl-NL", { dateStyle: "long" })}`
                    : "Nog niet ingesteld"}
                </h2>
                {mandate && <small className="muted">{mandate.version}</small>}
              </div>
              {mandate && (
                <span className="warning-badge">
                  {label(mandate.evidence_status)}
                </span>
              )}
            </div>
            {mandate ? (
              <div className="horizon-grid">
                <div>
                  <small>Doel</small>
                  <strong>{label(mandate.objective)}</strong>
                </div>
                <div>
                  <small>Horizon</small>
                  <strong>{mandate.horizon_months} mnd</strong>
                </div>
                <div>
                  <small>Max drawdown</small>
                  <strong>{mandate.maximum_drawdown_percent}%</strong>
                </div>
                <div>
                  <small>Min. cash</small>
                  <strong>{mandate.minimum_cash_percent}%</strong>
                </div>
              </div>
            ) : (
              <p className="muted">
                Sla eerst een mandaat op; zonder mandaat mag de allocation
                engine later geen target range produceren.
              </p>
            )}
          </section>
          <section className="panel mandate-benchmarks">
            <div className="panel-head">
              <div>
                <span className="overline">CAS-013 / preregistered</span>
                <h2>Bevroren benchmarks</h2>
              </div>
              <span>{benchmarks.length} definities</span>
            </div>
            {benchmarks.map((item) => (
              <article
                className="journal-entry"
                key={`${item.code}:${item.version}`}
              >
                <div>
                  <span className="fresh-badge">{item.status}</span>
                  <strong>{item.code}</strong>
                  <time>{item.version}</time>
                </div>
                <p>{item.notes}</p>
                <small>
                  Definitie: {Object.keys(item.definition).join(" · ")}
                </small>
              </article>
            ))}
          </section>
        </div>
      </section>
    </Shell>
  );
}
