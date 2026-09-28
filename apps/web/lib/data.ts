import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SIGNOFF_PROBLEMS, type SignoffProblem } from "./signoff-problems";
import {
  isUnchangedRecommendation,
  modifiedTargetViolations,
  parsePortfolioCsv,
  type RecommendationSnapshot,
  RECOMMENDATION_OUTCOME_VERSION,
  type ModifiedRanges,
  type TargetRanges,
} from "@cmip/domain";

export interface Factor {
  code: string;
  family: string;
  timing?: string;
  classification?: string;
  classificationStatus?: string;
  score: number | null;
  rawValue: number | null;
  description: string;
  status: string;
}
export interface FactorBreakdown {
  coverage: number;
  factors: Factor[];
  warnings: string[];
}
export interface DecisionView {
  id: string;
  calculated_at: string;
  symbol: "BTC" | "ETH";
  asset_name: string;
  decision_state: string;
  previous_state: string | null;
  candidate_state: string | null;
  confidence_level: "LOW" | "MEDIUM" | "HIGH";
  engine_version: string;
  transition_reason: string;
  risk_override: string;
  opportunity_state: string | null;
  opportunity_score: number | null;
  stress_state: string | null;
  stress_score: number | null;
  model_validation_status: "UNVALIDATED" | "SHADOW" | "VALIDATED";
  snapshot_freshness: "CURRENT" | "STALE";
  macro_state: string;
  macro_score: number;
  crypto_state: string;
  crypto_score: number;
  market_structure_state: string;
  market_structure_score: number;
  asset_state: string;
  asset_score: number;
  macro_factors: FactorBreakdown;
  crypto_factors: FactorBreakdown;
  market_structure_factors: FactorBreakdown;
  asset_factors: FactorBreakdown;
  explanation_facts: {
    positiveDrivers?: Factor[];
    negativeDrivers?: Factor[];
    riskDrivers?: Factor[];
    contradictorySignals?: Factor[];
    dataWarnings?: string[];
  };
}
export interface IndicatorHealth {
  code: string;
  name: string;
  category: string;
  unit: string;
  expected_frequency: string;
  stale_after_seconds: number;
  observed_at: string | null;
  value: number | null;
  quality_status: string | null;
  provider: string | null;
  source_type: "CANONICAL" | "DERIVED" | null;
  freshness: string;
}
export interface TrustStatus {
  model_validation_status: "UNVALIDATED" | "SHADOW" | "VALIDATED";
  fresh_indicators: number;
  stale_indicators: number;
  missing_indicators: number;
  open_quality_events: number;
  latest_decision_at: string | null;
  decision_freshness: "CURRENT" | "STALE" | "MISSING";
}
export interface ValidationReplay {
  id: string;
  replay_mode: "RECONSTRUCTED" | "POINT_IN_TIME";
  completed_at: string;
  from_date: string;
  to_date: string;
  evaluated_days: number;
  available_decisions: number;
  transition_count: number;
  methodology_version: string;
  metrics: {
    byAsset?: Record<
      string,
      Record<
        string,
        {
          samples: number;
          meanForwardReturn: number | null;
          meanAdverseExcursion: number | null;
        }
      >
    >;
    byDecision?: Record<
      string,
      Record<
        string,
        {
          samples: number;
          meanForwardReturn: number | null;
          meanAdverseExcursion: number | null;
        }
      >
    >;
    nonOverlappingByDecision?: Record<
      string,
      Record<
        string,
        {
          samples: number;
          meanForwardReturn: number | null;
          meanAdverseExcursion: number | null;
        }
      >
    >;
    buyHoldReturn?: Record<string, number | null>;
    dma200BaselineReturn?: Record<string, number | null>;
    whipsawsWithin14Days?: Record<string, number>;
  };
  limitations: string[];
}
export interface PointInTimeAudit {
  id: string;
  status: "PASSED" | "BLOCKED";
  completed_at: string;
  required_indicators: number;
  passed_indicators: number;
  total_observations: number;
  late_observations: number;
  missing_availability: number;
  blockers: string[];
  summary: {
    prospectiveStart: string | null;
    prospectiveDays: number;
    requiredProspectiveDays: number;
    note: string;
  };
}
export interface NotificationView {
  id: string;
  alert_type: string;
  severity: string;
  direction: string;
  title: string;
  message: string;
  event_at: string;
  created_at: string;
  read_at: string | null;
  delivery_status: string;
  email_status: string;
  decision_snapshot_id: string | null;
  symbol: "BTC" | "ETH" | null;
}
export interface JournalEntry {
  id: string;
  entry_type: "OBSERVATION" | "DECISION" | "REVIEW";
  human_action: "NO_ACTION" | "REVIEW_ONLY" | "ADD_CAPITAL" | "REDUCE_RISK";
  thesis: string;
  invalidating_evidence: string | null;
  review_on: string | null;
  created_at: string;
  decision_snapshots: { decision_state: string; calculated_at: string } | null;
  assets: { symbol: string } | null;
}
export interface V1GateAssessment {
  assessed_at: string;
  overall_status: "PASSED" | "BLOCKED";
  protocol_version: string;
  gates: Record<string, { status: string; [key: string]: unknown }>;
  blockers: string[];
  metrics: Record<string, number>;
}
export interface InvestorMandateView {
  id: string;
  version: string;
  base_currency: "EUR" | "USD";
  objective: "CAPITAL_PRESERVATION" | "BALANCED" | "GROWTH";
  horizon_months: number;
  maximum_drawdown_percent: number;
  minimum_cash_percent: number;
  maximum_asset_weight_percent: number;
  annual_turnover_budget_percent: number;
  rebalance_cadence: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  allowed_assets: Array<"BTC" | "ETH">;
  evidence_status: "SHADOW";
  effective_at: string;
}
export interface BenchmarkDefinitionView {
  code: string;
  version: string;
  status: "FROZEN" | "RETIRED";
  definition: Record<string, unknown>;
  frozen_at: string;
  notes: string;
}
export interface PortfolioAccountView {
  id: string;
  name: string;
  base_currency: "EUR" | "USD";
  account_type: string;
  created_at: string;
}
export interface PortfolioHoldingView {
  account_id: string;
  symbol: "CASH" | "BTC" | "ETH";
  quantity: number;
}
export interface PortfolioTransactionView {
  id: string;
  account_id: string;
  transaction_type: string;
  symbol: string;
  quantity: number;
  unit_price: number;
  fee: number;
  executed_at: string;
  notes: string | null;
  portfolio_accounts: { name: string } | null;
}
export interface AllocationWorkspace {
  mandate: InvestorMandateView | null;
  valuations: Array<Record<string, unknown>>;
  theses: Array<Record<string, unknown>>;
  scenarios: Array<Record<string, unknown>>;
  recommendation: Record<string, unknown> | null;
  risk: Record<string, unknown> | null;
  paper: Record<string, unknown> | null;
  readiness: Record<string, unknown> | null;
  signoffs: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown> | null;
}
export interface DashboardHistoryPoint {
  evaluation_date: string;
  decision_state: string;
  macro_state: string;
  macro_score: number;
  crypto_state: string;
  crypto_score: number;
  market_structure_state: string;
  market_structure_score: number;
  asset_state: string;
  asset_score: number;
  price: number;
  dma_200: number | null;
  transitioned: boolean;
  assets: { symbol: "BTC" | "ETH" } | null;
}
export interface IndicatorSeries {
  code: string;
  name: string;
  category: string;
  unit: string;
  expected_frequency: string;
  stale_after_seconds: number;
  factor_family: string | null;
  factor_classification: string | null;
  classification_status: string | null;
  canonical_source: string | null;
  data_contract: Record<string, unknown>;
  source_type: "CANONICAL" | "DERIVED";
  points: Array<{ date: string; value: number; quality: string }>;
}
/** PostgREST returns at most this many rows per request. */
const PAGE_SIZE = 1_000;
async function database() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll() {
        /* Session refresh is handled by proxy. */
      },
    },
  });
}
function handleQueryError(
  source: string,
  error: { code?: string; message?: string },
) {
  if (error.code === "PGRST303") redirect("/auth/reset");
  console.error(`${source} query failed`, {
    code: error.code,
    message: error.message,
  });
}
export async function decisions(limit = 100) {
  const client = await database();
  if (!client) return [] as DecisionView[];
  const { data, error } = await client
    .from("decision_experience")
    .select("*")
    .order("calculated_at", { ascending: false })
    .limit(limit);
  if (error) {
    handleQueryError("decision_experience", error);
    return [];
  }
  return data as DecisionView[];
}
export async function decision(id: string) {
  const client = await database();
  if (!client) return null;
  const { data, error } = await client
    .from("decision_experience")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    handleQueryError("decision_experience", error);
    return null;
  }
  return data as DecisionView | null;
}
export async function indicatorHealth() {
  const client = await database();
  if (!client) return [] as IndicatorHealth[];
  const { data, error } = await client
    .from("indicator_health")
    .select("*")
    .order("category")
    .order("code");
  if (error) {
    handleQueryError("indicator_health", error);
    return [];
  }
  return data as IndicatorHealth[];
}
export async function trustStatus() {
  const client = await database();
  if (!client) return null;
  const { data, error } = await client
    .from("trust_status")
    .select("*")
    .maybeSingle();
  if (error) {
    handleQueryError("trust_status", error);
    return null;
  }
  return data as TrustStatus | null;
}
export async function validationReplay() {
  const client = await database();
  if (!client) return null;
  const { data, error } = await client
    .from("validation_replay_latest")
    .select("*")
    .maybeSingle();
  if (error) {
    handleQueryError("validation_replay_latest", error);
    return null;
  }
  return data as ValidationReplay | null;
}
export async function pointInTimeAudit() {
  const client = await database();
  if (!client) return { audit: null, indicators: [] };
  const { data: audit, error } = await client
    .from("point_in_time_audit_latest")
    .select("*")
    .maybeSingle();
  if (error) {
    handleQueryError("point_in_time_audit_latest", error);
    return { audit: null, indicators: [] };
  }
  if (!audit) return { audit: null, indicators: [] };
  const { data: indicators, error: indicatorError } = await client
    .from("point_in_time_indicator_results")
    .select(
      "availability_basis,minimum_history,total_observations,same_day_available,late_observations,missing_availability,point_in_time_status,blockers,indicators(code)",
    )
    .eq("audit_id", audit.id)
    .order("point_in_time_status");
  if (indicatorError) {
    handleQueryError("point_in_time_indicator_results", indicatorError);
    return { audit: audit as PointInTimeAudit, indicators: [] };
  }
  return { audit: audit as PointInTimeAudit, indicators: indicators ?? [] };
}
export async function operationalHealth() {
  const client = await database();
  if (!client) return { events: [], runs: [], modelRuns: [], trust: [] };
  const [events, runs, modelRuns, trust] = await Promise.all([
    client
      .from("data_quality_events")
      .select(
        "id,event_type,severity,details,created_at,resolved_at,indicators(code,name),providers(name)",
      )
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("ingestion_runs")
      .select(
        "id,job_type,status,started_at,completed_at,records_received,records_valid,records_rejected,records_quarantined,error,providers(name)",
      )
      .order("started_at", { ascending: false })
      .limit(30),
    client
      .from("model_runs")
      .select(
        "id,run_type,run_mode,status,started_at,completed_at,records_evaluated,error,engine_version",
      )
      .order("started_at", { ascending: false })
      .limit(20),
    client
      .from("trust_observations")
      .select("*")
      .order("observation_date", { ascending: false })
      .limit(90),
  ]);
  return {
    events: events.data ?? [],
    runs: runs.data ?? [],
    modelRuns: modelRuns.data ?? [],
    trust: trust.data ?? [],
  };
}
/**
 * "Actionable only" keeps warnings, critical alerts and every decision or
 * market-structure change. Uses the alert engine's own vocabulary
 * (packages/notifications): severities INFO/WARNING/CRITICAL and types
 * DECISION_CHANGE, REGIME_CHANGE, MARKET_STRUCTURE_RISK, DATA_QUALITY.
 */
const ACTIONABLE_ALERTS =
  "severity.in.(WARNING,CRITICAL),alert_type.in.(DECISION_CHANGE,MARKET_STRUCTURE_RISK)";
async function actionableOnly(
  client: NonNullable<Awaited<ReturnType<typeof database>>>,
) {
  const { data } = await client
    .from("user_product_settings")
    .select("actionable_notifications_only")
    .maybeSingle();
  return Boolean(data?.actionable_notifications_only);
}
export async function notificationInbox() {
  const client = await database();
  if (!client) return [] as NotificationView[];
  let query = client
    .from("notification_inbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (await actionableOnly(client)) query = query.or(ACTIONABLE_ALERTS);
  const { data, error } = await query;
  if (error) {
    handleQueryError("notification_inbox", error);
    return [];
  }
  return data as NotificationView[];
}
/** Unread alerts under the same filter the inbox applies. */
export async function unreadNotificationCount() {
  const client = await database();
  if (!client) return 0;
  // Runs on every page (navigation badge): read the setting and both counts
  // in parallel instead of one after the other.
  const unread = () =>
    client
      .from("notification_inbox")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
  const [onlyActionable, all, actionable] = await Promise.all([
    actionableOnly(client),
    unread(),
    unread().or(ACTIONABLE_ALERTS),
  ]);
  const result = onlyActionable ? actionable : all;
  if (result.error) {
    handleQueryError("notification_inbox", result.error);
    return 0;
  }
  return result.count ?? 0;
}
export async function notificationPreference() {
  const client = await database();
  if (!client)
    return {
      email_enabled: false,
      cooldown_hours: 24,
      actionable_notifications_only: true,
    };
  const [{ data, error }, { data: settings }] = await Promise.all([
    client
      .from("notification_preferences")
      .select("email_enabled,cooldown_hours")
      .maybeSingle(),
    client
      .from("user_product_settings")
      .select("actionable_notifications_only")
      .maybeSingle(),
  ]);
  if (error) {
    handleQueryError("notification_preferences", error);
    return {
      email_enabled: false,
      cooldown_hours: 24,
      actionable_notifications_only: true,
    };
  }
  return {
    ...(data ?? { email_enabled: false, cooldown_hours: 24 }),
    actionable_notifications_only:
      settings?.actionable_notifications_only ?? true,
  };
}
export async function markNotificationsRead() {
  const client = await database();
  if (!client) throw new Error("Database niet geconfigureerd");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet geautoriseerd");
  let query = client
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userData.user.id)
    .is("read_at", null);
  // Only mark what the inbox shows as read.
  if (await actionableOnly(client)) query = query.or(ACTIONABLE_ALERTS);
  const { error } = await query;
  if (error) throw error;
}
export async function saveNotificationPreference(
  emailEnabled: boolean,
  actionableOnly = true,
) {
  const client = await database();
  if (!client) throw new Error("Database niet geconfigureerd");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet geautoriseerd");
  const { error } = await client.from("notification_preferences").upsert(
    {
      user_id: userData.user.id,
      in_app_enabled: true,
      email_enabled: emailEnabled,
      cooldown_hours: 24,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  const settings = await client.from("user_product_settings").upsert(
    {
      user_id: userData.user.id,
      actionable_notifications_only: actionableOnly,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (settings.error) throw settings.error;
}
export async function journalEntries() {
  const client = await database();
  if (!client) return [] as JournalEntry[];
  const { data, error } = await client
    .from("investor_journal_entries")
    .select(
      "id,entry_type,human_action,thesis,invalidating_evidence,review_on,created_at,decision_snapshots(decision_state,calculated_at),assets(symbol)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    handleQueryError("investor_journal_entries", error);
    return [];
  }
  return data as unknown as JournalEntry[];
}
export async function addJournalEntry(input: {
  decisionId: string;
  entryType: string;
  humanAction: string;
  thesis: string;
  invalidatingEvidence: string;
  reviewOn: string;
}) {
  const client = await database();
  if (!client) throw new Error("Database niet geconfigureerd");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet geautoriseerd");
  const entryTypes = new Set(["OBSERVATION", "DECISION", "REVIEW"]),
    actions = new Set([
      "NO_ACTION",
      "REVIEW_ONLY",
      "ADD_CAPITAL",
      "REDUCE_RISK",
    ]);
  if (
    !entryTypes.has(input.entryType) ||
    !actions.has(input.humanAction) ||
    input.thesis.trim().length < 10
  )
    throw new Error("Ongeldige journal-invoer");
  const { data: snapshot, error: snapshotError } = await client
    .from("decision_snapshots")
    .select("asset_id")
    .eq("id", input.decisionId)
    .single();
  if (snapshotError || !snapshot)
    throw new Error("Modelsnapshot niet gevonden");
  const { error } = await client.from("investor_journal_entries").insert({
    user_id: userData.user.id,
    asset_id: snapshot.asset_id,
    decision_snapshot_id: input.decisionId,
    entry_type: input.entryType,
    human_action: input.humanAction,
    thesis: input.thesis.trim(),
    invalidating_evidence: input.invalidatingEvidence.trim() || null,
    review_on: input.reviewOn || null,
  });
  if (error) throw error;
}
export async function v1GateAssessment() {
  const client = await database();
  if (!client) return null;
  const { data, error } = await client
    .from("v1_gate_latest")
    .select("*")
    .maybeSingle();
  if (error) {
    handleQueryError("v1_gate_latest", error);
    return null;
  }
  return data as V1GateAssessment | null;
}
export async function currentInvestorMandate() {
  const client = await database();
  if (!client) return null;
  const { data, error } = await client
    .from("current_investor_mandate")
    .select("*")
    .maybeSingle();
  if (error) {
    handleQueryError("current_investor_mandate", error);
    return null;
  }
  return data as InvestorMandateView | null;
}
export async function benchmarkDefinitions() {
  const client = await database();
  if (!client) return [] as BenchmarkDefinitionView[];
  const { data, error } = await client
    .from("benchmark_definitions")
    .select("code,version,status,definition,frozen_at,notes")
    .eq("status", "FROZEN")
    .order("code");
  if (error) {
    handleQueryError("benchmark_definitions", error);
    return [];
  }
  return data as BenchmarkDefinitionView[];
}
export async function appendInvestorMandate(input: {
  baseCurrency: string;
  objective: string;
  horizonMonths: number;
  maximumDrawdownPercent: number;
  minimumCashPercent: number;
  maximumAssetWeightPercent: number;
  annualTurnoverBudgetPercent: number;
  rebalanceCadence: string;
  allowedAssets: string[];
}) {
  const client = await database();
  if (!client) throw new Error("Database niet geconfigureerd");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet geautoriseerd");
  const allowedCurrencies = new Set(["EUR", "USD"]),
    allowedObjectives = new Set(["CAPITAL_PRESERVATION", "BALANCED", "GROWTH"]),
    allowedCadences = new Set(["WEEKLY", "MONTHLY", "QUARTERLY"]),
    assets = [...new Set(input.allowedAssets)].filter(
      (asset) => asset === "BTC" || asset === "ETH",
    ),
    numeric = [
      input.horizonMonths,
      input.maximumDrawdownPercent,
      input.minimumCashPercent,
      input.maximumAssetWeightPercent,
      input.annualTurnoverBudgetPercent,
    ];
  if (
    !allowedCurrencies.has(input.baseCurrency) ||
    !allowedObjectives.has(input.objective) ||
    !allowedCadences.has(input.rebalanceCadence) ||
    !assets.length ||
    numeric.some((value) => !Number.isFinite(value))
  )
    throw new Error("Ongeldig investormandaat");
  if (
    input.horizonMonths < 3 ||
    input.horizonMonths > 240 ||
    input.maximumDrawdownPercent < 1 ||
    input.maximumDrawdownPercent > 80 ||
    input.minimumCashPercent < 0 ||
    input.minimumCashPercent > 100 ||
    input.maximumAssetWeightPercent < 1 ||
    input.maximumAssetWeightPercent > 100 ||
    input.minimumCashPercent + input.maximumAssetWeightPercent > 100 ||
    input.annualTurnoverBudgetPercent < 0 ||
    input.annualTurnoverBudgetPercent > 2000
  )
    throw new Error("Mandaatlimieten vallen buiten het toegestane bereik");
  const now = new Date();
  const { error } = await client.from("investor_mandates").insert({
    user_id: userData.user.id,
    version: `mandate-v1-${now.toISOString()}-${crypto.randomUUID()}`,
    base_currency: input.baseCurrency,
    objective: input.objective,
    horizon_months: input.horizonMonths,
    maximum_drawdown_percent: input.maximumDrawdownPercent,
    minimum_cash_percent: input.minimumCashPercent,
    maximum_asset_weight_percent: input.maximumAssetWeightPercent,
    annual_turnover_budget_percent: input.annualTurnoverBudgetPercent,
    rebalance_cadence: input.rebalanceCadence,
    allowed_assets: assets,
    evidence_status: "SHADOW",
    effective_at: now.toISOString(),
  });
  if (error) throw error;
}
export async function portfolioOverview() {
  const client = await database();
  if (!client)
    return {
      accounts: [] as PortfolioAccountView[],
      holdings: [] as PortfolioHoldingView[],
      transactions: [] as PortfolioTransactionView[],
      prices: {} as Record<string, number>,
    };
  const [accounts, holdings, transactions, prices] = await Promise.all([
    client
      .from("portfolio_accounts")
      .select("id,name,base_currency,account_type,created_at")
      .order("created_at"),
    client
      .from("portfolio_holdings")
      .select("account_id,symbol,quantity")
      .order("symbol"),
    client
      .from("portfolio_transactions")
      .select(
        "id,account_id,transaction_type,symbol,quantity,unit_price,fee,executed_at,notes,portfolio_accounts(name)",
      )
      .order("executed_at", { ascending: false })
      .limit(100),
    client
      .from("canonical_observations")
      .select("value,indicators!inner(code)")
      .in("indicators.code", ["BTC_USD", "ETH_USD"])
      .order("observed_at", { ascending: false })
      .limit(10),
  ]);
  for (const [source, result] of [
    ["portfolio_accounts", accounts],
    ["portfolio_holdings", holdings],
    ["portfolio_transactions", transactions],
  ] as const)
    if (result.error) handleQueryError(source, result.error);
  return {
    accounts: (accounts.data ?? []) as PortfolioAccountView[],
    holdings: (holdings.data ?? []).map((x) => ({
      ...x,
      quantity: Number(x.quantity),
    })) as PortfolioHoldingView[],
    transactions: (transactions.data ?? []).map((x) => ({
      ...x,
      quantity: Number(x.quantity),
      unit_price: Number(x.unit_price),
      fee: Number(x.fee),
    })) as unknown as PortfolioTransactionView[],
    prices: Object.fromEntries(
      (prices.data ?? [])
        .map((x) => [
          (x.indicators as unknown as { code: string }).code.replace(
            "_USD",
            "",
          ),
          Number(x.value),
        ])
        .filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i),
    ),
  };
}
export async function createPortfolioAccount(input: {
  name: string;
  baseCurrency: string;
}) {
  const client = await database();
  if (!client) throw new Error("Database niet geconfigureerd");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet geautoriseerd");
  const name = input.name.trim();
  if (
    name.length < 2 ||
    name.length > 80 ||
    !(input.baseCurrency === "EUR" || input.baseCurrency === "USD")
  )
    throw new Error("Ongeldig portfolioaccount");
  const { error } = await client.from("portfolio_accounts").insert({
    user_id: userData.user.id,
    name,
    base_currency: input.baseCurrency,
    account_type: "MANUAL",
  });
  if (error) throw error;
}
export async function appendPortfolioTransaction(input: {
  accountId: string;
  type: string;
  symbol: string;
  quantity: number;
  unitPrice: number;
  fee: number;
  executedAt: string;
  notes: string;
}) {
  const client = await database();
  if (!client) throw new Error("Database niet geconfigureerd");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet geautoriseerd");
  const types = new Set(["DEPOSIT", "WITHDRAWAL", "BUY", "SELL", "FEE"]),
    assets = new Set(["BTC", "ETH"]),
    cashTypes = new Set(["DEPOSIT", "WITHDRAWAL", "FEE"]),
    symbol = cashTypes.has(input.type) ? "CASH" : input.symbol;
  if (
    !types.has(input.type) ||
    !Number.isFinite(input.quantity) ||
    input.quantity <= 0 ||
    !Number.isFinite(input.unitPrice) ||
    input.unitPrice < 0 ||
    !Number.isFinite(input.fee) ||
    input.fee < 0 ||
    !input.executedAt ||
    ((input.type === "BUY" || input.type === "SELL") &&
      (!assets.has(symbol) || input.unitPrice <= 0))
  )
    throw new Error("Ongeldige transactie");
  const { data: account, error: accountError } = await client
    .from("portfolio_accounts")
    .select("id")
    .eq("id", input.accountId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (accountError || !account)
    throw new Error("Portfolioaccount niet gevonden");
  const { error } = await client.from("portfolio_transactions").insert({
    user_id: userData.user.id,
    account_id: account.id,
    transaction_type: input.type,
    symbol,
    quantity: input.quantity,
    unit_price: cashTypes.has(input.type) ? 0 : input.unitPrice,
    fee: input.fee,
    executed_at: new Date(input.executedAt).toISOString(),
    notes: input.notes.trim() || null,
  });
  if (error) throw error;
}
export async function importPortfolioCsv(input: {
  accountId: string;
  csv: string;
}) {
  const client = await database(),
    user = await ownedUser(client),
    { data: account } = await client!
      .from("portfolio_accounts")
      .select("id")
      .eq("id", input.accountId)
      .eq("user_id", user.id)
      .maybeSingle();
  if (!account) throw new Error("Portfolioaccount niet gevonden");
  const rows = parsePortfolioCsv(input.csv),
    cashTypes = new Set(["DEPOSIT", "WITHDRAWAL", "FEE"]),
    values = rows.map((row) => {
      const symbol = cashTypes.has(row.type) ? "CASH" : row.symbol;
      if (
        (row.type === "BUY" || row.type === "SELL") &&
        !(symbol === "BTC" || symbol === "ETH")
      )
        throw new Error("BUY/SELL vereist BTC of ETH");
      return {
        user_id: user.id,
        account_id: account.id,
        transaction_type: row.type,
        symbol,
        quantity: row.quantity,
        unit_price: cashTypes.has(row.type) ? 0 : row.unitPrice,
        fee: row.fee,
        executed_at: row.executedAt,
        notes: row.notes || null,
        external_reference: `CSV:${row.executedAt}:${row.type}:${symbol}:${row.quantity}:${row.unitPrice}:${row.fee}`,
      };
    });
  const { error } = await client!
    .from("portfolio_transactions")
    .upsert(values, {
      onConflict: "user_id,account_id,external_reference",
      ignoreDuplicates: true,
    });
  if (error) throw error;
  return rows.length;
}
export async function reconcilePortfolio(input: {
  accountId: string;
  statementBalances: string;
  tolerance: number;
}) {
  const client = await database(),
    user = await ownedUser(client);
  const { data: account } = await client!
    .from("portfolio_accounts")
    .select("id")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) throw new Error("Account niet gevonden");
  let statement: Record<string, number>;
  try {
    statement = JSON.parse(input.statementBalances);
  } catch {
    throw new Error("Saldi moeten geldige JSON zijn");
  }
  const normalized = Object.fromEntries(
    Object.entries(statement).map(([k, v]) => [k.toUpperCase(), Number(v)]),
  );
  if (Object.values(normalized).some((v) => !Number.isFinite(v)))
    throw new Error("Ongeldige statement-saldi");
  const { data: holdings, error } = await client!
    .from("portfolio_holdings")
    .select("symbol,quantity")
    .eq("account_id", account.id);
  if (error) throw error;
  const ledger = Object.fromEntries(
      (holdings ?? []).map((x) => [x.symbol, Number(x.quantity)]),
    ),
    symbols = new Set([...Object.keys(normalized), ...Object.keys(ledger)]),
    differences = Object.fromEntries(
      [...symbols].map((s) => [s, (normalized[s] ?? 0) - (ledger[s] ?? 0)]),
    ),
    tolerance = Math.max(0, Number(input.tolerance));
  const status = Object.values(differences).every(
    (v) => Math.abs(v) <= tolerance,
  )
    ? "MATCHED"
    : "BREAK";
  const result = await client!.from("portfolio_reconciliations").insert({
    user_id: user.id,
    account_id: account.id,
    statement_at: new Date().toISOString(),
    statement_balances: normalized,
    ledger_balances: ledger,
    differences,
    tolerance,
    status,
  });
  if (result.error) throw result.error;
}

export async function allocationWorkspace(): Promise<AllocationWorkspace> {
  const client = await database();
  if (!client)
    return {
      mandate: null,
      valuations: [],
      theses: [],
      scenarios: [],
      recommendation: null,
      risk: null,
      paper: null,
      readiness: null,
      signoffs: [],
      snapshot: null,
    };
  const [
    mandate,
    valuations,
    theses,
    scenarios,
    recommendation,
    risk,
    paper,
    readiness,
    signoffs,
    snapshot,
  ] = await Promise.all([
    client.from("current_investor_mandate").select("*").maybeSingle(),
    client
      .from("valuation_snapshots")
      .select("*,assets(symbol)")
      .order("calculated_at", { ascending: false })
      .limit(10),
    client
      .from("asset_theses")
      .select("*,assets(symbol)")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("scenario_sets")
      .select("*,assets(symbol)")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("allocation_recommendations")
      .select("*")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("portfolio_risk_snapshots")
      .select("*")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("paper_nav")
      .select("*,paper_portfolios!inner(user_id)")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("capital_readiness_assessments")
      .select("*")
      .order("assessed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("analyst_signoffs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("portfolio_snapshots")
      .select("*")
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    mandate: mandate.data as InvestorMandateView | null,
    valuations: valuations.data ?? [],
    theses: theses.data ?? [],
    scenarios: scenarios.data ?? [],
    recommendation: recommendation.data,
    risk: risk.data,
    paper: paper.data,
    readiness: readiness.data,
    signoffs: signoffs.data ?? [],
    snapshot: snapshot.data,
  };
}
async function ownedUser(client: Awaited<ReturnType<typeof database>>) {
  if (!client) throw new Error("Database niet geconfigureerd");
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Niet geautoriseerd");
  return data.user;
}
export async function appendAssetThesis(input: {
  symbol: string;
  thesis: string;
  drivers: string;
  counterThesis: string;
  invalidators: string;
  reviewOn: string;
  conviction?: string;
}) {
  const client = await database(),
    user = await ownedUser(client);
  if (input.thesis.trim().length < 20 || !input.reviewOn)
    throw new Error("Thesis en reviewdatum zijn verplicht");
  const { data: asset, error: ae } = await client!
    .from("assets")
    .select("id")
    .eq("symbol", input.symbol)
    .single();
  if (ae) throw ae;
  const now = new Date();
  const { error } = await client!.from("asset_theses").insert({
    user_id: user.id,
    asset_id: asset.id,
    version: `thesis-v1-${now.toISOString()}-${crypto.randomUUID()}`,
    status: "ACTIVE",
    thesis: input.thesis.trim(),
    causal_drivers: input.drivers.split("\n").filter(Boolean),
    assumptions: [],
    catalysts: [],
    counter_thesis: input.counterThesis.trim(),
    invalidators: input.invalidators.split("\n").filter(Boolean),
    review_on: input.reviewOn,
    evidence_status: "SHADOW",
    analyst_conviction: ["LOW", "MEDIUM", "HIGH"].includes(
      input.conviction ?? "",
    )
      ? input.conviction
      : "MEDIUM",
  });
  if (error) throw error;
}
export async function appendScenarioSet(input: {
  symbol: string;
  horizon: number;
  bearProbability: number;
  baseProbability: number;
  bullProbability: number;
  bearTarget: number;
  baseTarget: number;
  bullTarget: number;
}) {
  const client = await database(),
    user = await ownedUser(client),
    probabilities = [
      input.bearProbability,
      input.baseProbability,
      input.bullProbability,
    ],
    targets = [input.bearTarget, input.baseTarget, input.bullTarget];
  if (
    probabilities.some((x) => !Number.isFinite(x) || x < 0) ||
    Math.abs(probabilities.reduce((a, b) => a + b, 0) - 100) > 0.001 ||
    targets.some((x) => !Number.isFinite(x) || x <= 0) ||
    input.horizon < 1
  )
    throw new Error(
      "Scenario's moeten positieve targets en exact 100% waarschijnlijkheid hebben",
    );
  const { data: asset } = await client!
      .from("assets")
      .select("id")
      .eq("symbol", input.symbol)
      .single(),
    { data: valuation } = await client!
      .from("valuation_snapshots")
      .select("current_price")
      .eq("asset_id", asset!.id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .single(),
    price = Number(valuation!.current_price),
    returns = targets.map((x) => (x / price - 1) * 100),
    expected = returns.reduce(
      (s, x, i) => s + (x * probabilities[i]!) / 100,
      0,
    ),
    downside = Math.min(...returns),
    upside = Math.max(...returns);
  const { error } = await client!.from("scenario_sets").insert({
    user_id: user.id,
    asset_id: asset!.id,
    version: `scenario-v1-${new Date().toISOString()}-${crypto.randomUUID()}`,
    horizon_months: input.horizon,
    scenarios: [
      {
        name: "BEAR",
        probability: probabilities[0],
        target: targets[0],
        returnPercent: returns[0],
      },
      {
        name: "BASE",
        probability: probabilities[1],
        target: targets[1],
        returnPercent: returns[1],
      },
      {
        name: "BULL",
        probability: probabilities[2],
        target: targets[2],
        returnPercent: returns[2],
      },
    ],
    expected_return_percent: expected,
    downside_percent: downside,
    upside_downside_ratio: downside < 0 ? upside / Math.abs(downside) : null,
    evidence_status: "SHADOW",
  });
  if (error) throw error;
}
export {
  SIGNOFF_PROBLEMS,
  signoffProblemMessage,
  type SignoffProblem,
} from "./signoff-problems";
/** A sign-off the user can correct; carries a code, never free text. */
export class SignoffError extends Error {
  constructor(readonly code: SignoffProblem) {
    super(SIGNOFF_PROBLEMS[code]);
  }
}
export async function signoffRecommendation(input: {
  recommendationId: string;
  action: string;
  rationale: string;
  modifiedTargets?: string;
  reviewOn?: string;
}) {
  const client = await database(),
    user = await ownedUser(client),
    actions = new Set(["APPROVE", "MODIFY", "REJECT", "DEFER"]);
  if (!actions.has(input.action) || input.rationale.trim().length < 10)
    throw new SignoffError("invalid-input");
  const { data: r } = await client!
    .from("allocation_recommendations")
    .select(
      "id,status,mandate_id,target_ranges,investor_mandates(minimum_cash_percent,maximum_asset_weight_percent,allowed_assets)",
    )
    .eq("id", input.recommendationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!r) throw new SignoffError("not-found");
  // A frozen or infeasible recommendation has nothing to execute.
  if (
    (input.action === "APPROVE" || input.action === "MODIFY") &&
    r.status !== "AVAILABLE"
  )
    throw new SignoffError("not-available");
  let modifiedTargets: ModifiedRanges | null = null;
  if (input.action === "MODIFY") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.modifiedTargets ?? "");
    } catch {
      throw new SignoffError("invalid-json");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new SignoffError("invalid-json");
    const proposed = (r.target_ranges ?? {}) as TargetRanges;
    // Store only the fields execution reads (a supplied midpoint is ignored)
    // and only ranges that differ from the proposal: an untouched asset keeps
    // the model's own midpoint instead of its range middle.
    modifiedTargets = Object.fromEntries(
      Object.entries(parsed as Record<string, Record<string, unknown>>)
        .map(
          ([asset, range]) =>
            [
              asset,
              {
                minimum: Number(range?.minimum),
                maximum: Number(range?.maximum),
              },
            ] as const,
        )
        .filter(
          ([asset, range]) =>
            range.minimum !== Number(proposed[asset]?.minimum) ||
            range.maximum !== Number(proposed[asset]?.maximum),
        ),
    );
    const mandate = r.investor_mandates as unknown as {
      minimum_cash_percent: number;
      maximum_asset_weight_percent: number;
      allowed_assets: string[];
    };
    const violations = modifiedTargetViolations(
      r.target_ranges as TargetRanges,
      modifiedTargets,
      {
        minimumCashPercent: Number(mandate.minimum_cash_percent),
        maximumAssetWeightPercent: Number(mandate.maximum_asset_weight_percent),
        allowedAssets: mandate.allowed_assets,
      },
    );
    if (violations.includes("NO_CHANGES")) throw new SignoffError("no-changes");
    if (violations.includes("CASH_FLOOR")) throw new SignoffError("cash-floor");
    if (violations.length) throw new SignoffError("mandate");
  }
  const { error } = await client!.from("analyst_signoffs").insert({
    user_id: user.id,
    recommendation_id: r.id,
    action: input.action,
    rationale: input.rationale.trim(),
    modified_targets: modifiedTargets,
    review_on: input.reviewOn || null,
  });
  if (error) throw error;
}

export async function governanceWorkspace() {
  const client = await database();
  if (!client) return { sources: [], methods: [], rules: [], health: [] };
  const [sources, methods, rules, health] = await Promise.all([
    client.from("source_governance_latest").select("*").order("provider_name"),
    client
      .from("methodology_versions")
      .select("*")
      .order("created_at", { ascending: false }),
    client
      .from("source_reconciliation_rules")
      .select("*")
      .order("indicator_code"),
    client.from("allocation_source_gate").select("*").order("indicator_code"),
  ]);
  for (const result of [sources, methods, rules, health])
    if (result.error) handleQueryError("governance", result.error);
  return {
    sources: sources.data ?? [],
    methods: methods.data ?? [],
    rules: rules.data ?? [],
    health: health.data ?? [],
  };
}

export async function reviewQueue() {
  const client = await database();
  if (!client)
    return { theses: [], catalysts: [], recommendations: [], events: [] };
  const today = new Date().toISOString();
  const [theses, catalysts, recommendations, events] = await Promise.all([
    client
      .from("asset_theses")
      .select("*,assets(symbol)")
      .eq("status", "ACTIVE")
      .lte("review_on", today.slice(0, 10))
      .order("review_on"),
    client
      .from("catalyst_events")
      .select("*,assets(symbol)")
      .eq("status", "SCHEDULED")
      .gte("event_at", today)
      .order("event_at")
      .limit(30),
    client
      .from("allocation_recommendations")
      .select(
        "id,status,calculated_at,warnings,target_ranges,analyst_signoffs(id,action)",
      )
      .order("calculated_at", { ascending: false })
      .limit(30),
    client
      .from("data_quality_events")
      .select("id,severity,event_type,details,created_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  return {
    theses: theses.data ?? [],
    catalysts: catalysts.data ?? [],
    recommendations: recommendations.data ?? [],
    events: events.data ?? [],
  };
}

export async function assetDecisionPacket(symbol: string) {
  const client = await database();
  if (!client)
    return {
      valuation: null,
      fundamentals: [],
      thesis: null,
      scenario: null,
      recommendation: null,
    };
  const { data: asset } = await client
    .from("assets")
    .select("id")
    .eq("symbol", symbol)
    .maybeSingle();
  if (!asset)
    return {
      valuation: null,
      fundamentals: [],
      thesis: null,
      scenario: null,
      recommendation: null,
    };
  const [valuation, fundamentals, thesis, scenario, recommendation] =
    await Promise.all([
      client
        .from("valuation_snapshots")
        .select("*")
        .eq("asset_id", asset.id)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("fundamental_snapshots")
        .select("*")
        .eq("asset_id", asset.id)
        .order("calculated_at", { ascending: false })
        .limit(8),
      client
        .from("asset_theses")
        .select("*")
        .eq("asset_id", asset.id)
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("scenario_sets")
        .select("*")
        .eq("asset_id", asset.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("allocation_recommendations")
        .select("*")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  return {
    valuation: valuation.data,
    fundamentals: fundamentals.data ?? [],
    thesis: thesis.data,
    scenario: scenario.data,
    recommendation: recommendation.data,
  };
}

export async function addCatalyst(input: {
  symbol: string;
  type: string;
  title: string;
  eventAt: string;
  sourceUrl: string;
}) {
  const client = await database(),
    user = await ownedUser(client);
  if (input.title.trim().length < 5 || !input.eventAt)
    throw new Error("Ongeldige catalyst");
  const { data: asset, error } = await client!
    .from("assets")
    .select("id")
    .eq("symbol", input.symbol)
    .single();
  if (error) throw error;
  const inserted = await client!.from("catalyst_events").insert({
    user_id: user.id,
    asset_id: asset.id,
    event_type: input.type.trim().toUpperCase(),
    title: input.title.trim(),
    event_at: input.eventAt,
    source_url: input.sourceUrl.trim() || null,
  });
  if (inserted.error) throw inserted.error;
}

export async function universeWorkspace() {
  const client = await database();
  if (!client) return { reviews: [], connectors: [] };
  const [reviews, connectors] = await Promise.all([
    client
      .from("asset_admission_reviews")
      .select("*")
      .order("reviewed_at", { ascending: false }),
    client
      .from("read_only_connectors")
      .select("*,portfolio_accounts(name)")
      .order("created_at", { ascending: false }),
  ]);
  return { reviews: reviews.data ?? [], connectors: connectors.data ?? [] };
}
export async function addReadOnlyConnector(input: {
  accountId: string;
  provider: string;
  credentialReference: string;
}) {
  const client = await database(),
    user = await ownedUser(client);
  if (
    input.provider.trim().length < 2 ||
    input.credentialReference.trim().length < 3
  )
    throw new Error("Ongeldige connector");
  const { data: account } = await client!
    .from("portfolio_accounts")
    .select("id")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) throw new Error("Account niet gevonden");
  const result = await client!.from("read_only_connectors").insert({
    user_id: user.id,
    account_id: account.id,
    provider: input.provider.trim(),
    credential_reference: input.credentialReference.trim(),
    permissions: { read: true, trade: false, withdraw: false },
    status: "DISABLED",
  });
  if (result.error) throw result.error;
}
export async function addThesisEvidence(input: {
  thesisId: string;
  classification: string;
  fact: string;
  sourceUrl: string;
}) {
  const client = await database(),
    user = await ownedUser(client),
    allowed = new Set([
      "SUPPORTING",
      "CONTRADICTING",
      "IRRELEVANT",
      "HARD_INVALIDATOR",
    ]);
  if (!allowed.has(input.classification) || input.fact.trim().length < 10)
    throw new Error("Ongeldig thesisbewijs");
  let fact: Record<string, unknown>;
  try {
    fact = JSON.parse(input.fact);
  } catch {
    fact = { observation: input.fact.trim() };
  }
  const result = await client!.from("thesis_evidence").insert({
    user_id: user.id,
    thesis_id: input.thesisId,
    observed_at: new Date().toISOString(),
    classification: input.classification,
    fact,
    source_url: input.sourceUrl.trim() || null,
  });
  if (result.error) throw result.error;
}

export async function productExperience() {
  const client = await database();
  if (!client) return null;
  const { data, error } = await client
    .from("user_product_settings")
    .select("*")
    .maybeSingle();
  if (error) {
    handleQueryError("user_product_settings", error);
    throw new Error("Productinstellingen konden niet worden geladen");
  }
  return data;
}
export async function completeGuidedOnboarding(input: {
  experience: string;
  baseCurrency: string;
  objective: string;
  horizon: number;
  maxDrawdown: number;
  minCash: number;
  maxAsset: number;
  turnover: number;
  cadence: string;
  assets: string[];
  startingCapital: number;
}) {
  const client = await database();
  await ownedUser(client);
  const { error } = await client!.rpc("complete_guided_onboarding", {
    p_experience: input.experience,
    p_base_currency: input.baseCurrency,
    p_objective: input.objective,
    p_horizon: input.horizon,
    p_max_drawdown: input.maxDrawdown,
    p_min_cash: input.minCash,
    p_max_asset: input.maxAsset,
    p_turnover: input.turnover,
    p_cadence: input.cadence,
    p_assets: input.assets,
    p_starting_capital: input.startingCapital,
  });
  if (error) throw error;
}
export async function todayWorkspace() {
  const client = await database();
  if (!client)
    return {
      settings: null,
      mandate: null,
      recommendation: null,
      signoff: null,
      lastDecision: null,
      unchangedSinceDecision: false,
      events: [],
      theses: [],
      paper: null,
    };
  const [settings, mandate, recommendation, events, theses, paper] =
    await Promise.all([
      client.from("user_product_settings").select("*").maybeSingle(),
      client.from("current_investor_mandate").select("*").maybeSingle(),
      client
        .from("allocation_recommendations")
        .select("*")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("data_quality_events")
        .select("id,severity,event_type,details,created_at,indicators(code)")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
      client
        .from("asset_theses")
        .select("id,review_on,status,assets(symbol)")
        .eq("status", "ACTIVE")
        .order("review_on"),
      client
        .from("paper_nav")
        .select("nav,calculated_at,paper_portfolios!inner(user_id)")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  // Without settings the page would wrongly send the user to onboarding, so a
  // failed settings query must surface as an error instead.
  if (settings.error) {
    handleQueryError("user_product_settings", settings.error);
    throw new Error("Productinstellingen konden niet worden geladen");
  }
  for (const [source, result] of [
    ["current_investor_mandate", mandate],
    ["allocation_recommendations", recommendation],
    ["data_quality_events", events],
    ["asset_theses", theses],
    ["paper_nav", paper],
  ] as const)
    if (result.error) handleQueryError(source, result.error);
  // The latest human decision, whichever recommendation it was made on.
  const { data: lastDecision, error: lastDecisionError } = await client
    .from("analyst_signoffs")
    .select(
      "id,action,rationale,created_at,recommendation_id,allocation_recommendations(status,target_ranges,warnings,mandate_id)",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastDecisionError)
    handleQueryError("analyst_signoffs", lastDecisionError);
  const signoff =
    lastDecision && lastDecision.recommendation_id === recommendation.data?.id
      ? lastDecision
      : null;
  const decided =
    lastDecision?.allocation_recommendations as unknown as RecommendationSnapshot | null;
  // The daily cycle writes a fresh recommendation every day. When it proposes
  // exactly what was already decided on, there is nothing new to review.
  const unchangedSinceDecision = Boolean(
    recommendation.data &&
    !signoff &&
    decided &&
    // "Decide later" still asks for a decision.
    lastDecision?.action !== "DEFER" &&
    isUnchangedRecommendation(decided, recommendation.data),
  );
  return {
    settings: settings.data,
    mandate: mandate.data,
    recommendation: recommendation.data,
    signoff,
    lastDecision,
    unchangedSinceDecision,
    events: events.data ?? [],
    theses: theses.data ?? [],
    paper: paper.data,
  };
}
export async function paperWorkspace() {
  const client = await database();
  if (!client)
    return {
      portfolio: null,
      nav: [],
      trades: [],
      reports: [],
      analytics: null,
    };
  const { data: portfolio } = await client
    .from("paper_portfolios")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!portfolio)
    return {
      portfolio: null,
      nav: [],
      trades: [],
      reports: [],
      analytics: null,
    };
  const [nav, trades, reports, analytics] = await Promise.all([
    client
      .from("paper_nav")
      .select("*")
      .eq("paper_portfolio_id", portfolio.id)
      .order("calculated_at"),
    client
      .from("paper_trades")
      .select(
        "*,allocation_recommendations(calculated_at,target_ranges,warnings,analyst_signoffs(action,rationale,created_at))",
      )
      .eq("paper_portfolio_id", portfolio.id)
      .order("executed_at", { ascending: false }),
    client
      .from("monthly_validation_reports")
      .select("*")
      .order("report_month", { ascending: false }),
    client
      .from("performance_analytics")
      .select("*")
      .eq("paper_portfolio_id", portfolio.id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    portfolio,
    nav: nav.data ?? [],
    trades: trades.data ?? [],
    reports: reports.data ?? [],
    analytics: analytics.data,
  };
}
export async function paperTradeAudit(id: string) {
  const client = await database();
  if (!client) return null;
  const { data } = await client
    .from("paper_trades")
    .select(
      "*,paper_portfolios(*),allocation_recommendations(*,analyst_signoffs(*))",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}
export async function validationLearningWorkspace() {
  const client = await database();
  if (!client) return { reports: [], outcomes: [], analytics: [] };
  const [reports, outcomes, analytics] = await Promise.all([
    client
      .from("monthly_validation_reports")
      .select("*")
      .order("report_month", { ascending: false }),
    client
      .from("recommendation_outcomes")
      .select(
        "*,allocation_recommendations(calculated_at,status,analyst_signoffs(action))",
      )
      .eq("calculation_version", RECOMMENDATION_OUTCOME_VERSION)
      .eq("outcome_status", "OBSERVED")
      .order("observed_at", { ascending: false })
      .limit(500),
    client
      .from("performance_analytics")
      .select("*")
      .order("calculated_at", { ascending: false })
      .limit(24),
  ]);
  return {
    reports: reports.data ?? [],
    outcomes: outcomes.data ?? [],
    analytics: analytics.data ?? [],
  };
}
export async function dashboardHistory() {
  const client = await database();
  if (!client) return [] as DashboardHistoryPoint[];
  const { data: run, error: runError } = await client
    .from("validation_replay_latest")
    .select("id")
    .maybeSingle();
  if (runError || !run) {
    if (runError) handleQueryError("validation_replay_latest", runError);
    return [];
  }
  // The replay spans years for two assets, which exceeds a single PostgREST
  // page; the timeline's MAX range needs every row.
  const data: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await client
      .from("validation_replay_points")
      .select(
        "evaluation_date,decision_state,macro_state,macro_score,crypto_state,crypto_score,market_structure_state,market_structure_score,asset_state,asset_score,price,dma_200,transitioned,assets(symbol)",
      )
      .eq("replay_run_id", run.id)
      .order("evaluation_date")
      .order("asset_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      handleQueryError("validation_replay_points", error);
      return [];
    }
    data.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }
  return data as DashboardHistoryPoint[];
}

export async function indicatorSeries(codes: readonly string[]) {
  const client = await database();
  if (!client) return [] as IndicatorSeries[];
  return Promise.all(
    codes.map(async (code) => {
      const { data: indicator, error: indicatorError } = await client
        .from("indicators")
        .select(
          "id,code,name,category,unit,expected_frequency,stale_after_seconds,factor_family,factor_classification,classification_status,canonical_source,data_contract",
        )
        .eq("code", code)
        .maybeSingle();
      if (indicatorError || !indicator) {
        if (indicatorError)
          handleQueryError(`indicator:${code}`, indicatorError);
        return null;
      }
      const [canonical, derived] = await Promise.all([
        client
          .from("canonical_observations")
          .select("observed_at,value,quality_status")
          .eq("indicator_id", indicator.id)
          .not("value", "is", null)
          .order("observed_at", { ascending: false })
          .limit(PAGE_SIZE),
        client
          .from("indicator_snapshots")
          .select("calculated_at,raw_value,calculation_version")
          .eq("indicator_id", indicator.id)
          .not("raw_value", "is", null)
          .order("calculated_at", { ascending: false })
          .limit(PAGE_SIZE),
      ]);
      if (canonical.error || derived.error) {
        handleQueryError(
          `indicator-history:${code}`,
          canonical.error ?? derived.error!,
        );
        return null;
      }
      // Queried newest-first so long histories keep their latest points;
      // charts expect ascending order.
      const canonicalPoints = [...(canonical.data ?? [])]
        .reverse()
        .map((row) => ({
          date: row.observed_at,
          value: Number(row.value),
          quality: row.quality_status,
        }));
      const derivedPoints = [...(derived.data ?? [])].reverse().map((row) => ({
        date: row.calculated_at,
        value: Number(row.raw_value),
        quality: row.calculation_version,
      }));
      const source_type = canonicalPoints.length
        ? ("CANONICAL" as const)
        : ("DERIVED" as const);
      return {
        ...indicator,
        source_type,
        points: source_type === "CANONICAL" ? canonicalPoints : derivedPoints,
      } as IndicatorSeries;
    }),
  ).then((rows) => rows.filter((row): row is IndicatorSeries => row !== null));
}
