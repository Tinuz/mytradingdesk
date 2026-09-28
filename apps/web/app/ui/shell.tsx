import Link from "next/link";
import { unreadNotificationCount } from "../../lib/data";
import { viewMode } from "../../lib/view-mode";
import { Mark } from "./icons";
import { ModeToggle } from "./mode-toggle";

type Section =
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

const primary = [
  ["today", "Vandaag", "/today"],
  ["allocation", "Beslissen", "/allocation"],
  ["paper", "Resultaat", "/paper"],
] as const;
const advanced = [
  ["portfolio", "Werkelijk portfolio", "/portfolio"],
  ["dashboard", "Marktonderzoek", "/dashboard"],
  ["reviews", "Reviewqueue", "/reviews"],
  ["workbench", "Werkbank", "/workbench"],
  ["history", "Historie", "/history"],
  ["journal", "Journal", "/journal"],
  ["mandate", "Mandaat", "/mandate"],
  ["validation", "Validatie", "/validation"],
  ["validation-learning", "Beslissingskwaliteit", "/validation/learning"],
  ["research", "Datakwaliteit", "/research"],
  ["governance", "Trust", "/governance"],
  ["universe", "Universe", "/universe"],
] as const;

export async function Shell({
  children,
  current,
}: {
  children: React.ReactNode;
  current: Section;
}) {
  const [unread, mode] = await Promise.all([
    unreadNotificationCount(),
    viewMode(),
  ]);
  const advancedOpen = advanced.some(([key]) => key === current);
  return (
    <div className="terminal-shell">
      <aside className="sidebar">
        <Link href="/today" className="brand">
          <Mark />
          <span>
            CMI<em>Terminal</em>
          </span>
        </Link>
        <nav aria-label="Hoofdnavigatie" className="primary-nav">
          {primary.map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              className={current === key ? "active" : ""}
              aria-current={current === key ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/notifications"
            className={current === "notifications" ? "active" : ""}
            aria-current={current === "notifications" ? "page" : undefined}
          >
            Meldingen
            {unread > 0 && (
              <span className="nav-badge" aria-label={`${unread} ongelezen`}>
                {unread}
              </span>
            )}
          </Link>
        </nav>
        <details className="advanced-nav advanced-only" open={advancedOpen}>
          <summary>Geavanceerd</summary>
          <nav aria-label="Geavanceerde navigatie">
            {advanced.map(([key, label, href]) => (
              <Link
                key={key}
                href={href}
                className={current === key ? "active" : ""}
                aria-current={current === key ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        </details>
        <div className="sidebar-foot">
          <ModeToggle initial={mode} />
          <p className="sidebar-status">
            <span className="live-dot" /> Shadow allocation
            <small>alleen beslisondersteuning</small>
          </p>
        </div>
      </aside>
      <main className="terminal-main">{children}</main>
    </div>
  );
}
