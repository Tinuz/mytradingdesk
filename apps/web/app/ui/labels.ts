/**
 * Dutch display labels for stored vocabulary. The database keeps the stable
 * English codes; only the experience layer translates them.
 */
const LABELS: Record<string, string> = {
  // Recommendation status
  AVAILABLE: "Beslissing beschikbaar",
  FROZEN: "Verhoging geblokkeerd",
  NO_FEASIBLE_ALLOCATION: "Geen geldige allocatie",
  // Human decisions
  APPROVE: "Goedgekeurd voor paperverwerking",
  MODIFY: "Aangepast voor paperverwerking",
  REJECT: "Afgewezen",
  DEFER: "Uitgesteld",
  // Evidence
  HYPOTHESIS: "Hypothese",
  SHADOW: "Shadow, niet gevalideerd",
  VALIDATED: "Gevalideerd",
  RETIRED: "Uitgefaseerd",
  // Mandate objective
  CAPITAL_PRESERVATION: "Kapitaalbehoud",
  BALANCED: "Gebalanceerd",
  GROWTH: "Groei",
  // Data quality
  CRITICAL: "Kritiek",
  HIGH: "Hoog",
  MEDIUM: "Middel",
  LOW: "Laag",
  WARNING: "Waarschuwing",
  INFO: "Info",
  MISSING_INTERVAL: "Ontbrekende periode",
  STALE_DATA: "Verouderde data",
  PROVIDER_FAILURE: "Bronstoring",
  PROVIDER_DISCREPANCY: "Bronnen spreken elkaar tegen",
  RECONCILIATION_BREAK: "Reconciliatie mislukt",
  QUARANTINED: "In quarantaine",
  // Allocation warnings and constraints
  SOURCE_GATE: "Bron niet goedgekeurd",
  SOURCE_NOT_APPROVED: "bron niet goedgekeurd",
  FREEZE_ACTIVE: "blokkade actief",
  OPERATIONAL_FREEZE: "Operationele blokkade",
  METHODOLOGY_VERSION_NOT_ACTIVE: "Methodologie niet actief",
  NO_ACTIVE_THESIS: "geen actieve thesis",
  NOT_ALLOWED: "niet toegestaan in mandaat",
  STRESS_CAP: "begrensd door marktstress",
  ASSET_CAP: "maximum per asset bereikt",
  TOTAL_RISK_CAP: "Totaal risicomaximum bereikt",
  INVALID_MANDATE: "Ongeldig mandaat",
};

const fallback = (code: string) => code.replaceAll("_", " ").toLowerCase();

/** Label for one stored code, e.g. `AVAILABLE` or `balanced`. */
export function label(code: string | null | undefined): string {
  if (!code) return "—";
  return LABELS[code] ?? LABELS[code.toUpperCase()] ?? fallback(code);
}

/**
 * Label for a compound warning such as `SOURCE_GATE:BTC_USD` or
 * `BTC:FREEZE_ACTIVE`: known codes are translated, subjects kept as-is.
 */
export function warningLabel(warning: string): string {
  const parts = warning.split(":");
  if (parts.length < 2) return label(warning);
  const [first, ...rest] = parts;
  const tail = rest.join(":");
  if (LABELS[first!]) return `${LABELS[first!]}: ${tail}`;
  return `${first}: ${LABELS[tail] ?? fallback(tail)}`;
}
