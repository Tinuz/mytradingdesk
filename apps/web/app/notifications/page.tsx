import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Shell } from "../ui/shell";
import {
  markNotificationsRead,
  notificationInbox,
  notificationPreference,
  saveNotificationPreference,
} from "../../lib/data";
const date = (value: string) =>
  new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export default async function NotificationsPage() {
  const [alerts, preference] = await Promise.all([
    notificationInbox(),
    notificationPreference(),
  ]);
  const unread = alerts.filter((alert) => !alert.read_at).length;
  async function markRead() {
    "use server";
    await markNotificationsRead();
    revalidatePath("/notifications");
  }
  async function savePreference(formData: FormData) {
    "use server";
    await saveNotificationPreference(
      formData.get("email_enabled") === "on",
      formData.get("actionable_only") === "on",
    );
    revalidatePath("/notifications");
  }
  return (
    <Shell current="notifications">
      <header className="page-head">
        <div>
          <span className="overline">Alert engine / live only</span>
          <h1>Meldingen</h1>
          <p>
            Kies of je alleen meldingen wilt zien waarop je mogelijk moet
            handelen, of ook technische en informatieve updates.
          </p>
        </div>
        <div className="asof">
          Ongelezen<strong>{unread}</strong>
        </div>
      </header>
      <section className="notification-settings panel">
        <div>
          <span className="micro-label">Kanalen</span>
          <h2>Bezorging</h2>
          <p className="muted">
            In-app staat altijd aan. E-mail vereist een geconfigureerde
            Resend-key en geverifieerd afzenderdomein.
          </p>
        </div>
        <form action={savePreference}>
          <label>
            <input
              name="actionable_only"
              type="checkbox"
              defaultChecked={preference.actionable_notifications_only}
            />{" "}
            Alleen actieverelevante meldingen
          </label>
          <label>
            <input
              name="email_enabled"
              type="checkbox"
              defaultChecked={preference.email_enabled}
            />{" "}
            E-mailmeldingen inschakelen
          </label>
          <button type="submit">Opslaan</button>
        </form>
      </section>
      <div className="section-title">
        <div>
          <span className="micro-label">Live transitions</span>
          <h2>Inbox</h2>
        </div>
        {unread > 0 && (
          <form action={markRead}>
            <button className="text-button" type="submit">
              Zichtbare meldingen als gelezen
            </button>
          </form>
        )}
      </div>
      {alerts.length === 0 ? (
        <div className="empty-state">
          <span>Geen meldingen</span>
          <p>
            De engine maakt alleen nieuwe meldingen na activatie; historische
            snapshots veroorzaken niets.
          </p>
        </div>
      ) : (
        <section className="notification-list">
          {alerts.map((alert) => (
            <article
              className={`notification-row ${alert.read_at ? "read" : "unread"}`}
              key={alert.id}
            >
              <span
                className={`notification-severity ${alert.severity.toLowerCase()}`}
              >
                {alert.severity}
              </span>
              <div>
                <div className="notification-title">
                  <strong>{alert.title}</strong>
                  <small>{alert.direction}</small>
                </div>
                <p>{alert.message}</p>
                <footer>
                  <time>{date(alert.event_at)}</time>
                  <span>
                    {alert.email_status === "DELIVERED"
                      ? "E-mail verzonden"
                      : alert.email_status === "FAILED"
                        ? "E-mail mislukt"
                        : "In-app"}
                  </span>
                  {alert.symbol && alert.decision_snapshot_id && (
                    <Link
                      href={`/assets/${alert.symbol.toLowerCase()}?decision=${alert.decision_snapshot_id}`}
                    >
                      Bekijk snapshot →
                    </Link>
                  )}
                </footer>
              </div>
            </article>
          ))}
        </section>
      )}
    </Shell>
  );
}
