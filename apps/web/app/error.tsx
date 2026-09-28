"use client";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Shown when a page fails to render. Details stay in the server logs; the
 * digest lets an operator find the matching entry.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="error-page">
      <span className="overline">Er ging iets mis</span>
      <h1>Deze pagina kon niet worden geladen</h1>
      <p>
        Probeer het opnieuw. Blijft het misgaan, controleer dan op Vandaag of je
        laatste beslissing is vastgelegd en bekijk de datakwaliteit.
      </p>
      {error.digest && <p className="muted">Referentie: {error.digest}</p>}
      <div className="error-actions">
        <button
          className="primary-action"
          type="button"
          onClick={() => retry()}
        >
          Opnieuw proberen
        </button>
        <Link href="/today">Naar Vandaag</Link>
      </div>
    </main>
  );
}
