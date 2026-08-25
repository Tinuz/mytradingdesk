import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
export interface PortfolioAccountView { id:string;name:string;base_currency:"EUR"|"USD";account_type:string;created_at:string }
export interface PortfolioHoldingView { account_id:string;symbol:"CASH"|"BTC"|"ETH";quantity:number }
export interface PortfolioTransactionView { id:string;account_id:string;transaction_type:string;symbol:string;quantity:number;unit_price:number;fee:number;executed_at:string;notes:string|null;portfolio_accounts:{name:string}|null }
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
export async function notificationInbox() {
  const client = await database();
  if (!client) return [] as NotificationView[];
  const { data, error } = await client
    .from("notification_inbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    handleQueryError("notification_inbox", error);
    return [];
  }
  return data as NotificationView[];
}
export async function notificationPreference() {
  const client = await database();
  if (!client) return { email_enabled: false, cooldown_hours: 24 };
  const { data, error } = await client
    .from("notification_preferences")
    .select("email_enabled,cooldown_hours")
    .maybeSingle();
  if (error) {
    handleQueryError("notification_preferences", error);
    return { email_enabled: false, cooldown_hours: 24 };
  }
  return data ?? { email_enabled: false, cooldown_hours: 24 };
}
export async function markNotificationsRead() {
  const client = await database();
  if (!client) throw new Error("Database niet geconfigureerd");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Niet geautoriseerd");
  const { error } = await client
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userData.user.id)
    .is("read_at", null);
  if (error) throw error;
}
export async function saveNotificationPreference(emailEnabled: boolean) {
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
    assets = [...new Set(input.allowedAssets)].filter((asset) => asset === "BTC" || asset === "ETH"),
    numeric = [input.horizonMonths, input.maximumDrawdownPercent, input.minimumCashPercent, input.maximumAssetWeightPercent, input.annualTurnoverBudgetPercent];
  if (!allowedCurrencies.has(input.baseCurrency) || !allowedObjectives.has(input.objective) || !allowedCadences.has(input.rebalanceCadence) || !assets.length || numeric.some((value) => !Number.isFinite(value))) throw new Error("Ongeldig investormandaat");
  if (input.horizonMonths < 3 || input.horizonMonths > 240 || input.maximumDrawdownPercent < 1 || input.maximumDrawdownPercent > 80 || input.minimumCashPercent < 0 || input.minimumCashPercent > 100 || input.maximumAssetWeightPercent < 1 || input.maximumAssetWeightPercent > 100 || input.minimumCashPercent + input.maximumAssetWeightPercent > 100 || input.annualTurnoverBudgetPercent < 0 || input.annualTurnoverBudgetPercent > 2000) throw new Error("Mandaatlimieten vallen buiten het toegestane bereik");
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
  const client=await database();if(!client)return{accounts:[]as PortfolioAccountView[],holdings:[]as PortfolioHoldingView[],transactions:[]as PortfolioTransactionView[]};
  const[accounts,holdings,transactions]=await Promise.all([client.from("portfolio_accounts").select("id,name,base_currency,account_type,created_at").order("created_at"),client.from("portfolio_holdings").select("account_id,symbol,quantity").order("symbol"),client.from("portfolio_transactions").select("id,account_id,transaction_type,symbol,quantity,unit_price,fee,executed_at,notes,portfolio_accounts(name)").order("executed_at",{ascending:false}).limit(100)]);
  for(const[source,result]of[["portfolio_accounts",accounts],["portfolio_holdings",holdings],["portfolio_transactions",transactions]]as const)if(result.error)handleQueryError(source,result.error);
  return{accounts:(accounts.data??[])as PortfolioAccountView[],holdings:(holdings.data??[]).map(x=>({...x,quantity:Number(x.quantity)}))as PortfolioHoldingView[],transactions:(transactions.data??[]).map(x=>({...x,quantity:Number(x.quantity),unit_price:Number(x.unit_price),fee:Number(x.fee)}))as unknown as PortfolioTransactionView[]};
}
export async function createPortfolioAccount(input:{name:string;baseCurrency:string}){
  const client=await database();if(!client)throw new Error("Database niet geconfigureerd");const{data:userData,error:userError}=await client.auth.getUser();if(userError||!userData.user)throw new Error("Niet geautoriseerd");const name=input.name.trim();if(name.length<2||name.length>80||!(input.baseCurrency==="EUR"||input.baseCurrency==="USD"))throw new Error("Ongeldig portfolioaccount");const{error}=await client.from("portfolio_accounts").insert({user_id:userData.user.id,name,base_currency:input.baseCurrency,account_type:"MANUAL"});if(error)throw error;
}
export async function appendPortfolioTransaction(input:{accountId:string;type:string;symbol:string;quantity:number;unitPrice:number;fee:number;executedAt:string;notes:string}){
  const client=await database();if(!client)throw new Error("Database niet geconfigureerd");const{data:userData,error:userError}=await client.auth.getUser();if(userError||!userData.user)throw new Error("Niet geautoriseerd");const types=new Set(["DEPOSIT","WITHDRAWAL","BUY","SELL","FEE"]),assets=new Set(["BTC","ETH"]),cashTypes=new Set(["DEPOSIT","WITHDRAWAL","FEE"]),symbol=cashTypes.has(input.type)?"CASH":input.symbol;
  if(!types.has(input.type)||!Number.isFinite(input.quantity)||input.quantity<=0||!Number.isFinite(input.unitPrice)||input.unitPrice<0||!Number.isFinite(input.fee)||input.fee<0||!input.executedAt||((input.type==="BUY"||input.type==="SELL")&&(!assets.has(symbol)||input.unitPrice<=0)))throw new Error("Ongeldige transactie");
  const{data:account,error:accountError}=await client.from("portfolio_accounts").select("id").eq("id",input.accountId).eq("user_id",userData.user.id).maybeSingle();if(accountError||!account)throw new Error("Portfolioaccount niet gevonden");const{error}=await client.from("portfolio_transactions").insert({user_id:userData.user.id,account_id:account.id,transaction_type:input.type,symbol,quantity:input.quantity,unit_price:cashTypes.has(input.type)?0:input.unitPrice,fee:input.fee,executed_at:new Date(input.executedAt).toISOString(),notes:input.notes.trim()||null});if(error)throw error;
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
  const { data, error } = await client
    .from("validation_replay_points")
    .select(
      "evaluation_date,decision_state,macro_state,macro_score,crypto_state,crypto_score,market_structure_state,market_structure_score,asset_state,asset_score,price,dma_200,transitioned,assets(symbol)",
    )
    .eq("replay_run_id", run.id)
    .order("evaluation_date");
  if (error) {
    handleQueryError("validation_replay_points", error);
    return [];
  }
  return data as unknown as DashboardHistoryPoint[];
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
          .order("observed_at")
          .limit(2000),
        client
          .from("indicator_snapshots")
          .select("calculated_at,raw_value,calculation_version")
          .eq("indicator_id", indicator.id)
          .not("raw_value", "is", null)
          .order("calculated_at")
          .limit(2000),
      ]);
      if (canonical.error || derived.error) {
        handleQueryError(
          `indicator-history:${code}`,
          canonical.error ?? derived.error!,
        );
        return null;
      }
      const canonicalPoints = (canonical.data ?? []).map((row) => ({
        date: row.observed_at,
        value: Number(row.value),
        quality: row.quality_status,
      }));
      const derivedPoints = (derived.data ?? []).map((row) => ({
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
