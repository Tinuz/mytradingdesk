import { createClient } from "@supabase/supabase-js";
import {
  dataQualityAlert,
  decisionAlert,
  selectAlerts,
  type AlertCandidate,
  type AlertType,
  type RecentAlert,
} from "@cmip/notifications";
import { fetchAllPages, listAllUsers } from "./lib/runtime";
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
};
const mode = process.argv.includes("--live") ? "LIVE" : ("HISTORICAL" as const);
if (mode === "HISTORICAL") {
  console.log(
    JSON.stringify({
      mode,
      alertsCreated: 0,
      emailDelivered: 0,
      reason: "Historical mode never emits alerts.",
    }),
  );
  process.exit(0);
}
const client = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: state, error: stateError } = await client
  .from("alert_engine_state")
  .select("live_since")
  .eq("id", true)
  .single();
if (stateError) throw stateError;
type DecisionRow = {
  id: string;
  calculated_at: string;
  symbol: "BTC" | "ETH";
  decision_state: string;
  macro_score: number;
  crypto_score: number;
  market_structure_state: string;
  asset_score: number;
  risk_override: string;
  asset_id?: string;
};
const candidates: AlertCandidate[] = [];
const { data: assets, error: assetError } = await client
  .from("assets")
  .select("id,symbol")
  .in("symbol", ["BTC", "ETH"]);
if (assetError) throw assetError;
const decisionColumns =
  "id,calculated_at,symbol,decision_state,macro_score,crypto_score,market_structure_state,asset_score,risk_override";
for (const asset of assets ?? []) {
  const [live, before] = await Promise.all([
    fetchAllPages((from, to) =>
      client
        .from("decision_experience")
        .select(decisionColumns)
        .eq("symbol", asset.symbol)
        .gte("calculated_at", state.live_since)
        .order("calculated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    // The snapshot just before the watermark is the baseline for the first
    // live snapshot; it never produces an alert itself.
    client
      .from("decision_experience")
      .select(decisionColumns)
      .eq("symbol", asset.symbol)
      .lt("calculated_at", state.live_since)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (before.error) throw before.error;
  let previous = before.data as DecisionRow | null;
  for (const current of live as DecisionRow[]) {
    if (previous) {
      const candidate = decisionAlert(
        {
          eventId: current.id,
          decisionSnapshotId: current.id,
          assetId: asset.id,
          assetSymbol: asset.symbol,
          occurredAt: current.calculated_at,
          previousDecision: previous.decision_state,
          decision: current.decision_state,
          previousMacroScore: previous.macro_score,
          macroScore: current.macro_score,
          previousCryptoScore: previous.crypto_score,
          cryptoScore: current.crypto_score,
          previousMarketStructure: previous.market_structure_state,
          marketStructure: current.market_structure_state,
          previousAssetScore: previous.asset_score,
          assetScore: current.asset_score,
          previousRiskOverride: previous.risk_override,
          riskOverride: current.risk_override,
        },
        "LIVE",
      );
      if (candidate) candidates.push(candidate);
    }
    previous = current;
  }
}
const { data: quality, error: qualityError } = await client
  .from("data_quality_events")
  .select("id,event_type,severity,created_at,indicators(code)")
  .gte("created_at", state.live_since)
  .is("resolved_at", null)
  .order("created_at");
if (qualityError) throw qualityError;
for (const event of quality ?? []) {
  const indicator = Array.isArray(event.indicators)
    ? event.indicators[0]
    : event.indicators;
  const candidate = dataQualityAlert(
    {
      eventId: event.id,
      indicatorCode: indicator?.code ?? "ONBEKEND",
      occurredAt: event.created_at,
      eventType: event.event_type,
      severity: event.severity,
    },
    "LIVE",
  );
  if (candidate) candidates.push(candidate);
}
const users = await listAllUsers(client);
let alertsCreated = 0,
  emailDelivered = 0,
  suppressed = 0;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]!,
  );
async function sendEmail(to: string, alert: AlertCandidate) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": alert.fingerprint,
    },
    body: JSON.stringify({
      from: required("ALERT_EMAIL_FROM"),
      to: [to],
      subject: `CMI — ${alert.title}`,
      html: `<h2>${escapeHtml(alert.title)}</h2><p>${escapeHtml(alert.message)}</p><p><small>${escapeHtml(alert.occurredAt)}</small></p>`,
    }),
  });
  const body = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || !body.id)
    throw new Error(`Resend delivery failed (${response.status})`);
  return body.id;
}
for (const user of users) {
  const { data: preference, error: preferenceError } = await client
    .from("notification_preferences")
    .select("in_app_enabled,email_enabled,cooldown_hours")
    .eq("user_id", user.id)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  const settings = preference ?? {
    in_app_enabled: true,
    email_enabled: false,
    cooldown_hours: 24,
  };
  if (!settings.in_app_enabled && !settings.email_enabled) continue;
  const since = new Date(
    Date.now() - settings.cooldown_hours * 3_600_000,
  ).toISOString();
  const { data: recentRows, error: recentError } = await client
    .from("alerts")
    .select("fingerprint,alert_type,asset_id,created_at")
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (recentError) throw recentError;
  const recent: RecentAlert[] = (recentRows ?? []).map((row) => ({
    fingerprint: row.fingerprint,
    alertType: row.alert_type as AlertType,
    assetId: row.asset_id,
    createdAt: row.created_at,
  }));
  const selected = selectAlerts(
    candidates,
    recent,
    new Date(),
    settings.cooldown_hours,
  );
  suppressed += selected.suppressed.length;
  for (const alert of selected.accepted) {
    const emailPending = settings.email_enabled && Boolean(user.email);
    const { data: inserted, error: insertError } = await client
      .from("alerts")
      .insert({
        user_id: user.id,
        asset_id: alert.assetId,
        decision_snapshot_id: alert.decisionSnapshotId,
        alert_type: alert.alertType,
        severity: alert.severity,
        direction: alert.direction,
        fingerprint: alert.fingerprint,
        title: alert.title,
        message: alert.message,
        event_at: alert.occurredAt,
        payload: alert.payload,
        delivered_at: new Date().toISOString(),
        delivery_status: "DELIVERED",
        email_status: emailPending ? "PENDING" : "DISABLED",
      })
      .select("id")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        suppressed++;
        continue;
      }
      throw insertError;
    }
    alertsCreated++;
    if (emailPending && user.email) {
      try {
        const providerId = await sendEmail(user.email, alert);
        await client
          .from("alerts")
          .update({ email_status: "DELIVERED", email_provider_id: providerId })
          .eq("id", inserted.id);
        emailDelivered++;
      } catch {
        await client
          .from("alerts")
          .update({ email_status: "FAILED" })
          .eq("id", inserted.id);
      }
    }
  }
}
console.log(
  JSON.stringify({
    mode,
    eventsEvaluated: candidates.length,
    alertsCreated,
    emailDelivered,
    suppressed,
  }),
);
