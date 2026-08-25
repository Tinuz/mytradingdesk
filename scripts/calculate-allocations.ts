import { createClient } from "@supabase/supabase-js";
import { allocateShadowPortfolio } from "@cmip/signal-engine";
import type {
  AssetSymbol,
  InvestmentRegime,
  MarketStructureRegime,
} from "@cmip/domain";
const req = (n: string) => {
    const v = process.env[n];
    if (!v) throw new Error(`${n} missing`);
    return v;
  },
  c = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  ),
  at = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now());
const [{ data: userPage, error: ue }, { data: sourceGate, error: se }] =
  await Promise.all([
    c.auth.admin.listUsers(),
    c
      .from("allocation_source_gate")
      .select(
        "code,approval_status,automation_rights,historical_storage_rights",
      ),
  ]);
if (ue) throw ue;
if (se) throw se;
const {data:methodologies,error:me}=await c.from("methodology_versions").select("methodology_type,version,status").in("version",["allocation-policy-v1-shadow.1","risk-policy-v1-shadow.1"]);if(me)throw me;const methodologyApproved=(methodologies??[]).length===2&&(methodologies??[]).every(x=>x.status==="SHADOW"||x.status==="VALIDATED");
const unapproved = (sourceGate ?? []).filter(
    (x) =>
      x.approval_status !== "APPROVED" ||
      x.automation_rights !== "ALLOWED" ||
      x.historical_storage_rights !== "ALLOWED",
  ),
  dataApproved = unapproved.length === 0 && methodologyApproved,
  out = [];
const { data: criticalEvents } = await c
    .from("data_quality_events")
    .select("id,event_type")
    .is("resolved_at", null)
    .in("severity", ["CRITICAL", "HIGH"]),
  operationalFreeze = (criticalEvents?.length ?? 0) > 0;
for (const user of userPage.users) {
  const { data: mandate } = await c
    .from("investor_mandates")
    .select("*")
    .eq("user_id", user.id)
    .lte("effective_at", at.toISOString())
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!mandate) {
    out.push({ user: user.id, status: "BLOCKED", reason: "NO_MANDATE" });
    continue;
  }
  const { data: decisions } = await c
      .from("decision_experience")
      .select(
        "id,symbol,opportunity_state,market_structure_state,calculated_at",
      )
      .lte("calculated_at", at.toISOString())
      .order("calculated_at", { ascending: false })
      .limit(20),
    latest = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions ?? [])
    if (!latest.has(d.symbol)) latest.set(d.symbol, d);
  const { data: assets } = await c
      .from("assets")
      .select("id,symbol")
      .in("symbol", ["BTC", "ETH"]),
    inputs = [],
    valuationIds: string[] = [],
    scenarioIds: string[] = [];
  for (const asset of assets ?? []) {
    const d = latest.get(asset.symbol),
      [{ data: thesis }, { data: valuation }, { data: scenario }] =
        await Promise.all([
          c
            .from("asset_theses")
            .select("id")
            .eq("user_id", user.id)
            .eq("asset_id", asset.id)
            .eq("status", "ACTIVE")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          c
            .from("valuation_snapshots")
            .select("id,fair_value_base,current_price")
            .eq("asset_id", asset.id)
            .lte("calculated_at", at.toISOString())
            .order("calculated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          c
            .from("scenario_sets")
            .select("id,expected_return_percent")
            .eq("user_id", user.id)
            .eq("asset_id", asset.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
    const { data: hardInvalidator } = thesis
      ? await c
          .from("thesis_evidence")
          .select("id")
          .eq("thesis_id", thesis.id)
          .eq("classification", "HARD_INVALIDATOR")
          .limit(1)
          .maybeSingle()
      : { data: null };
    if (valuation) valuationIds.push(valuation.id);
    if (scenario) scenarioIds.push(scenario.id);
    const expected = scenario
      ? Number(scenario.expected_return_percent)
      : valuation
        ? (Number(valuation.fair_value_base) / Number(valuation.current_price) -
            1) *
          100
        : null;
    inputs.push({
      asset: asset.symbol as AssetSymbol,
      opportunityState: (d?.opportunity_state ?? "NEUTRAL") as InvestmentRegime,
      stressState: (d?.market_structure_state ??
        "STRESSED") as MarketStructureRegime,
      expectedReturnPercent: expected,
      thesisActive: Boolean(thesis),
      dataApproved,
      frozen: !d || !valuation || Boolean(hardInvalidator) || operationalFreeze,
    });
  }
  const result = allocateShadowPortfolio(inputs, {
      minimumCashPercent: Number(mandate.minimum_cash_percent),
      maximumAssetWeightPercent: Number(mandate.maximum_asset_weight_percent),
      allowedAssets: mandate.allowed_assets,
    }),
    { data: snapshot } = await c
      .from("portfolio_snapshots")
      .select("id")
      .eq("user_id", user.id)
      .lte("snapshot_at", at.toISOString())
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  if (!dataApproved)
    result.warnings.push(...unapproved.map((x) => `SOURCE_GATE:${x.code}`));
  if(!methodologyApproved)result.warnings.push("METHODOLOGY_VERSION_NOT_ACTIVE");
  if (operationalFreeze)
    result.warnings.push(
      ...(criticalEvents ?? []).map(
        (x) => `OPERATIONAL_FREEZE:${x.event_type}`,
      ),
    );
  const { error } = await c.from("allocation_recommendations").upsert(
    {
      user_id: user.id,
      calculated_at: at.toISOString(),
      mandate_id: mandate.id,
      portfolio_snapshot_id: snapshot?.id ?? null,
      decision_snapshot_ids: [...latest.values()].map((x) => x.id),
      valuation_snapshot_ids: valuationIds,
      scenario_set_ids: scenarioIds,
      allocation_policy_version: result.version,
      risk_policy_version: "risk-policy-v1-shadow.1",
      status: result.status,
      evidence_status: "SHADOW",
      data_confidence: dataApproved ? "MEDIUM" : "LOW",
      model_evidence_status: "SHADOW",
      thesis_conviction: Object.fromEntries(
        inputs.map((x) => [x.asset, x.thesisActive ? "PRESENT" : "MISSING"]),
      ),
      target_ranges: { ...result.targets, CASH: result.cash },
      binding_constraints: result.bindingConstraints,
      warnings: result.warnings,
      explanation_facts: { inputs, sourceGate },
    },
    {
      onConflict: "user_id,calculated_at,allocation_policy_version",
      ignoreDuplicates: true,
    },
  );
  if (error) throw error;
  out.push({
    user: user.id,
    status: result.status,
    targets: { ...result.targets, CASH: result.cash },
  });
}
console.log(
  JSON.stringify(
    {
      calculatedAt: at.toISOString(),
      sourceGate: {
        approved: dataApproved,
        unapproved: unapproved.map((x) => x.code),
      },
      recommendations: out,
    },
    null,
    2,
  ),
);
