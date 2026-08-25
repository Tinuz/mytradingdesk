"use client";
import { useActionState, useRef, useState } from "react";
export function OnboardingWizard({
  action,
}: {
  action: (data: FormData) => Promise<{ error: string } | undefined>;
}) {
  const [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [serverState, formAction, pending] = useActionState(
      (_previous: { error: string } | undefined, data: FormData) =>
        action(data),
      undefined,
    ),
    formRef = useRef<HTMLFormElement>(null),
    steps = [
      "Welkom",
      "Ervaring",
      "Risicoprofiel",
      "Paperportfolio",
      "Bevestigen",
    ];
  function next() {
    setError("");
    const section =
      formRef.current?.querySelectorAll<HTMLElement>(".wizard-step")[step];
    if (!section) return;
    for (const field of section.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input,select,textarea")) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return;
      }
    }
    if (
      step === 2 &&
      !section.querySelector<HTMLInputElement>('input[name="assets"]:checked')
    ) {
      setError("Kies minimaal één asset om door te gaan.");
      return;
    }
    setStep((s) => s + 1);
  }
  return (
    <form ref={formRef} action={formAction} className="panel wizard-shell">
      <div
        className="wizard-progress"
        aria-label={`Stap ${step + 1} van ${steps.length}`}
      >
        {steps.map((_, i) => (
          <i key={i} className={i <= step ? "done" : ""} />
        ))}
      </div>
      <p className="overline">
        Stap {step + 1} / {steps.length} · {steps[step]}
      </p>
      <section className="wizard-step" hidden={step !== 0}>
        <h1>Test beslissingen zonder echt geld</h1>
        <p>
          CMI signaleert mogelijke momenten om blootstelling te verhogen, te
          laten staan of risico af te bouwen. De app plaatst nooit orders. De
          komende 6–12 maanden worden beslissingen alleen in een paperportfolio
          gevolgd.
        </p>
        <label>
          <input name="disclaimer" type="checkbox" required /> Ik begrijp dat
          dit research en decision support is, geen garantie of automatische
          belegging.
        </label>
      </section>
      <section className="wizard-step" hidden={step !== 1}>
        <h2>Hoe wil je de app gebruiken?</h2>
        <label>
          <input type="radio" name="experience" value="GUIDED" defaultChecked />{" "}
          Begeleid — duidelijke vervolgstappen en technische details ingeklapt
        </label>
        <label>
          <input type="radio" name="experience" value="ADVANCED" /> Geavanceerd
          — alle modellen, bronnen en validatiemetrics zichtbaar
        </label>
      </section>
      <section className="wizard-step" hidden={step !== 2}>
        <h2>Je grenzen bepalen</h2>
        <label>
          Hoofddoel
          <select name="objective" defaultValue="BALANCED">
            <option value="CAPITAL_PRESERVATION">
              Kapitaal zoveel mogelijk beschermen
            </option>
            <option value="BALANCED">Groei en bescherming balanceren</option>
            <option value="GROWTH">Langetermijngroei nastreven</option>
          </select>
        </label>
        <label>
          Beleggingshorizon
          <select name="horizon">
            <option value="12">1 jaar</option>
            <option value="36">3 jaar</option>
            <option value="60">5 jaar</option>
          </select>
        </label>
        <label>
          Hoeveel tijdelijk verlies kun je verdragen?
          <select name="max_drawdown">
            <option value="15">Voorzichtig — maximaal 15%</option>
            <option value="25">Gemiddeld — maximaal 25%</option>
            <option value="40">Hoog — maximaal 40%</option>
          </select>
        </label>
        <label>
          Minimaal cash achterhouden (%)
          <input
            name="min_cash"
            type="number"
            min="0"
            max="90"
            defaultValue="20"
          />
        </label>
        <label>
          Maximaal per cryptoasset (%)
          <input
            name="max_asset"
            type="number"
            min="5"
            max="90"
            defaultValue="50"
          />
        </label>
        <fieldset>
          <legend>Welke assets mogen worden gevolgd?</legend>
          <label>
            <input name="assets" type="checkbox" value="BTC" defaultChecked />{" "}
            Bitcoin
          </label>
          <label>
            <input name="assets" type="checkbox" value="ETH" defaultChecked />{" "}
            Ethereum
          </label>
        </fieldset>
      </section>
      <section className="wizard-step" hidden={step !== 3}>
        <h2>Paperportfolio starten</h2>
        <label>
          Basisvaluta
          <select name="base_currency">
            <option>EUR</option>
            <option>USD</option>
          </select>
        </label>
        <label>
          Fictief startkapitaal
          <input
            name="starting_capital"
            type="number"
            min="1000"
            step="1000"
            defaultValue="100000"
          />
        </label>
        <label>
          Beoordelingsritme
          <select name="cadence">
            <option value="WEEKLY">Wekelijks</option>
            <option value="MONTHLY">Maandelijks</option>
            <option value="QUARTERLY">Per kwartaal</option>
          </select>
        </label>
        <input name="turnover" type="hidden" value="200" />
        <p className="validation-warning">
          Paper trades worden alleen na jouw expliciete goedkeuring verwerkt.
          Kosten en slippage worden meegerekend; echt geld wordt nooit
          aangeraakt.
        </p>
      </section>
      <section className="wizard-step" hidden={step !== 4}>
        <h2>Klaar voor de testperiode</h2>
        <div className="step-list">
          <div className="step-item">
            <b>1</b>
            <span>Bekijk dagelijks of er iets ter beoordeling staat</span>
          </div>
          <div className="step-item">
            <b>2</b>
            <span>Lees drivers, risico’s en invalidators</span>
          </div>
          <div className="step-item">
            <b>3</b>
            <span>Keur een paperbeslissing goed, pas aan of wijs af</span>
          </div>
          <div className="step-item">
            <b>4</b>
            <span>Evalueer maandelijks resultaat en proceskwaliteit</span>
          </div>
        </div>
        <button className="primary-action" type="submit" disabled={pending}>
          {pending ? "Veilig opslaan…" : "Configuratie opslaan en beginnen"}
        </button>
      </section>
      {error && (
        <p className="validation-warning" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      {serverState?.error && (
        <p className="validation-warning" role="alert" aria-live="assertive">
          {serverState.error}
        </p>
      )}
      {step < 4 && (
        <div className="wizard-actions">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            Vorige
          </button>
          <button className="primary-action" type="button" onClick={next}>
            Volgende
          </button>
        </div>
      )}
    </form>
  );
}
