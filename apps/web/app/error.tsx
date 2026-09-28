"use client";
import Link from "next/link";

/**
 * Shown when a page or form action fails. Details stay in the server logs;
 * the digest lets an operator find the matching entry.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="error-page">
      <span className="overline">Er ging iets mis</span>
      <h1>Deze stap kon niet worden afgerond</h1>
      <p>
        Er is niets gewijzigd aan je paperportfolio. Probeer het opnieuw; blijft
        het misgaan, controleer dan je invoer of de datakwaliteit.
      </p>
      {error.digest && <p className="muted">Referentie: {error.digest}</p>}
      <div className="error-actions">
        <button className="primary-action" type="button" onClick={reset}>
          Opnieuw proberen
        </button>
        <Link href="/today">Naar Vandaag</Link>
      </div>
    </main>
  );
}
