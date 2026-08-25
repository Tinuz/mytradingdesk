import Link from "next/link";
import { Mark } from "./icons";
import { ModeToggle } from "./mode-toggle";
export function Shell({
  children,
  current,
}: {
  children: React.ReactNode;
  current:
    | "dashboard"
    | "allocation"
    | "governance"
    | "reviews"
    | "universe"
    | "portfolio"
    | "history"
    | "journal"
    | "research"
    | "notifications"
    | "validation"
    | "mandate"
    | "today"
    | "paper"
    | "workbench"
    | "onboarding";
}) {
  const nav = [
    ["today", "Vandaag", "/today"],
    ["allocation", "Beslissen", "/allocation"],
    ["paper", "Resultaat", "/paper"],
  ] as const;
  return (
    <div className="terminal-shell">
      <aside className="sidebar">
        <Link href="/today" className="brand">
          <Mark />
          <span>
            CMI<em>Terminal</em>
          </span>
        </Link>
        <nav aria-label="Hoofdnavigatie">
          {nav.map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              className={current === key ? "active" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>
        <details className="advanced-nav advanced-only">
          <summary>Geavanceerd</summary>
          <nav>
            <Link href="/portfolio">Werkelijk portfolio</Link>
            <Link href="/dashboard">Marktonderzoek</Link>
            <Link href="/reviews">Reviewqueue</Link>
            <Link href="/workbench">Werkbank</Link>
            <Link href="/history">Historie</Link>
            <Link href="/journal">Journal</Link>
            <Link href="/mandate">Mandaat</Link>
            <Link href="/validation">Validatie</Link>
            <Link href="/validation/learning">Beslissingskwaliteit</Link>
            <Link href="/research">Datakwaliteit</Link>
            <Link href="/governance">Trust</Link>
            <Link href="/universe">Universe</Link>
          </nav>
        </details>
        <div className="sidebar-foot">
          <ModeToggle />
          <span className="live-dot" /> Shadow allocation
          <br />
          <small>decision support only</small>
        </div>
      </aside>
      <main className="terminal-main">{children}</main>
    </div>
  );
}
