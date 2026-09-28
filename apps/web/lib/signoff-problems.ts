/** Fixed messages for sign-off problems the user can correct. */
export const SIGNOFF_PROBLEMS = {
  "invalid-input":
    "Kies een actie en licht je keuze toe in minstens 10 tekens.",
  "not-found": "Deze aanbeveling bestaat niet (meer).",
  "not-available":
    "Alleen een beschikbare aanbeveling kan worden goedgekeurd of aangepast.",
  "invalid-json": "Aanpassen vereist geldige bandbreedtes.",
  "no-changes": "Pas minstens één bandbreedte aan, of kies Akkoord.",
  "cash-floor": "De aangepaste bandbreedtes laten te weinig cash over.",
  mandate: "De aangepaste bandbreedtes passen niet binnen je mandaat.",
} as const;
export type SignoffProblem = keyof typeof SIGNOFF_PROBLEMS;

/**
 * Message for a code taken from the URL. Only the codes defined above map to
 * text; anything else, including inherited names such as `toString`, is null.
 */
export function signoffProblemMessage(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(SIGNOFF_PROBLEMS, code)
    ? SIGNOFF_PROBLEMS[code as SignoffProblem]
    : null;
}
