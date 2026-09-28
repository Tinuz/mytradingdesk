import Link from "next/link";
import { redirect } from "next/navigation";
import { todayWorkspace } from "../../lib/data";
import { viewMode } from "../../lib/view-mode";
import { Shell } from "../ui/shell";
import { GuidedJourney } from "../ui/guided-journey";
import { label } from "../ui/labels";

type QualityEvent = {
  id: string;
  severity: string;
  event_type: string;
  details: unknown;
  created_at: string;
  indicators: { code: string } | { code: string }[] | null;
};
/** A short readable summary of an event's details, never raw JSON. */
function eventSummary(event: QualityEvent) {
  const indicator = Array.isArray(event.indicators)
    ? event.indicators[0]
    : event.indicators;
  const details = (event.details ?? {}) as Record<string, unknown>;
  const facts = Object.entries(details)
    .filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value),
    )
    .slice(0, 3)
    .map(([key, value]) => `${label(key)}: ${String(value)}`);
  return [indicator?.code, ...facts].filter(Boolean).join(" · ");
}

export default async function TodayPage() {
  const [w, mode] = await Promise.all([todayWorkspace(), viewMode()]);
  if (!w.settings?.onboarding_completed_at) redirect("/onboarding");
  const critical = w.events.find((x: { severity: string }) =>
    ["CRITICAL", "HIGH"].includes(x.severity),
  );
  let action = {
    tone: "",
    eyebrow: "Geen actie vereist",
    title: "Blijf het proces volgen",
    body: "Er staat momenteel geen nieuwe beslissing klaar. De dagelijkse cyclus blijft markt-, data- en thesiswijzigingen controleren.",
    href: "/paper",
    cta: "Bekijk paperresultaten",
  };
  if (critical)
    action = {
      tone: "danger",
      eyebrow: "Controle vereist",
      title: "Dataprobleem blokkeert nieuwe exposure",
      body: "Controleer eerst de bron- of operationele fout. Risico reduceren blijft mogelijk; nieuwe exposure wordt niet verhoogd.",
      href: "/allocation",
      cta: "Bekijk waarom",
    };
  else if (!w.recommendation)
    action = {
      tone: "warning",
      eyebrow: "Wachten op modelcyclus",
      title: "Nog geen allocatiebeslissing",
      body: "Je configuratie is compleet. Na de volgende succesvolle cyclus verschijnt hier een beoordeling.",
      href: "/paper",
      cta: "Bekijk je testportfolio",
    };
  else if (w.recommendation.status !== "AVAILABLE")
    action = {
      tone: "warning",
      eyebrow: "Beslissing geblokkeerd",
      title: label(w.recommendation.status),
      body: "De app vraagt geen verhoging zolang data, thesis, waardering of mandaatvoorwaarden onvoldoende zijn.",
      href: "/allocation",
      cta: "Bekijk redenen",
    };
  else if (!w.signoff && w.unchangedSinceDecision)
    action = {
      tone: "",
      eyebrow: "Geen actie vereist",
      title: "Voorstel ongewijzigd sinds je laatste beslissing",
      body: `Het model stelt dezelfde bandbreedtes voor als toen je besliste (${label(w.lastDecision?.action).toLowerCase()}). Je hoeft niets opnieuw te beoordelen.`,
      href: "/paper",
      cta: "Bekijk paperresultaten",
    };
  else if (!w.signoff)
    action = {
      tone: "",
      eyebrow: "Menselijke beoordeling nodig",
      title: "Nieuwe paperbeslissing klaar",
      body: "Bekijk targetranges, scenarioverlies, drivers en invalidators. Jij beslist of de paperportfolio wordt aangepast.",
      href: "/allocation",
      cta: "Beoordeel beslissing",
    };
  else
    action = {
      tone: "",
      eyebrow: "Beslissing vastgelegd",
      title: label(w.signoff.action),
      body: "De originele modeluitkomst blijft ongewijzigd. Een goedgekeurde paperwijziging wordt in de volgende dagelijkse cyclus verwerkt.",
      href: "/paper",
      cta: "Volg paperportfolio",
    };
  return (
    <Shell current="today">
      <GuidedJourney current="today" />
      <header className="page-head">
        <div>
          <span className="overline">Stap 1 · wat speelt er?</span>
          <h1>Vandaag</h1>
          <p>
            Eén plek voor wat veranderde, wat aandacht vraagt en wat je zelf
            moet beslissen.
          </p>
        </div>
        <div className="asof">
          Modus
          <strong>{mode === "advanced" ? "Geavanceerd" : "Begeleid"}</strong>
        </div>
      </header>
      <section className={`next-action ${action.tone}`}>
        <div>
          <span className="overline">{action.eyebrow}</span>
          <h2>{action.title}</h2>
          <p>{action.body}</p>
        </div>
        <Link className="primary-action" href={action.href}>
          {action.cta}
        </Link>
      </section>
      <section className="panel guided-only simple-explainer">
        <span className="overline">Zo gebruik je dit scherm</span>
        <h2>Volg alleen de kaart hierboven</h2>
        <p>
          De app controleert de markt en je grenzen. Alleen wanneer een nieuwe
          paperbeslissing klaarstaat ga je door naar stap 2. Je hoeft niet zelf
          alle onderliggende metrics te combineren.
        </p>
      </section>
      <section className="step-list advanced-only">
        <div className="step-item">
          <b>{w.mandate ? "✓" : "1"}</b>
          <div>
            <strong>Mandaat en grenzen</strong>
            <p>
              {w.mandate
                ? `${w.mandate.minimum_cash_percent}% minimum cash · ${w.mandate.maximum_asset_weight_percent}% maximum per asset`
                : "Nog niet ingesteld"}
            </p>
          </div>
          <Link href="/mandate">Bekijken →</Link>
        </div>
        <div className="step-item">
          <b>{w.recommendation ? "✓" : "2"}</b>
          <div>
            <strong>Laatste modelsnapshot</strong>
            <p>
              {w.recommendation
                ? `${label(w.recommendation.status)} · bewijs: ${label(w.recommendation.model_evidence_status).toLowerCase()}`
                : "Nog niet berekend"}
            </p>
          </div>
          <Link href="/allocation">Uitleg →</Link>
        </div>
        <div className="step-item">
          <b>{w.signoff ? "✓" : "3"}</b>
          <div>
            <strong>Jouw beoordeling</strong>
            <p>
              {w.signoff
                ? `${label(w.signoff.action)} · ${w.signoff.rationale}`
                : "Wacht op jouw besluit zodra een geldige recommendation bestaat"}
            </p>
          </div>
          <Link href="/allocation">Beslissen →</Link>
        </div>
        <div className="step-item">
          <b>{w.paper ? "✓" : "4"}</b>
          <div>
            <strong>Paperresultaat</strong>
            <p>
              {w.paper
                ? `Laatste fictieve NAV ${Number(w.paper.nav).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`
                : "Nog geen dagelijkse paperwaardering"}
            </p>
          </div>
          <Link href="/paper">Volgen →</Link>
        </div>
      </section>
      <section className="panel mandate-benchmarks advanced-only">
        <div className="panel-head">
          <div>
            <span className="overline">Zo lees je statussen</span>
            <h2>Vier gescheiden vertrouwensvragen</h2>
          </div>
        </div>
        <div className="status-legend">
          <article>
            <strong>Data</strong>
            <p>Zijn bronnen beschikbaar, toegestaan en actueel?</p>
          </article>
          <article>
            <strong>Modelbewijs</strong>
            <p>Hypothese, shadow of voldoende prospectief gevalideerd?</p>
          </article>
          <article>
            <strong>Beslissing</strong>
            <p>Beschikbaar, bevroren of onmogelijk binnen je grenzen?</p>
          </article>
          <article>
            <strong>Paper</strong>
            <p>Wacht op goedkeuring, ingepland of fictief verwerkt?</p>
          </article>
        </div>
      </section>
      <section className="panel advanced-only">
        <div className="panel-head">
          <h2>Open technische aandachtspunten</h2>
          <span>{w.events.length}</span>
        </div>
        {!w.events.length && (
          <p className="muted">Geen openstaande data- of bronproblemen.</p>
        )}
        {(w.events as QualityEvent[]).map((event) => (
          <article className="journal-entry" key={event.id}>
            <strong>
              {label(event.severity)} · {label(event.event_type)}
            </strong>
            <p>{eventSummary(event) || "Geen aanvullende details"}</p>
            <time>{new Date(event.created_at).toLocaleString("nl-NL")}</time>
          </article>
        ))}
      </section>
    </Shell>
  );
}
