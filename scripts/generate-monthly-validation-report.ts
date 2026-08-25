import { createClient } from "@supabase/supabase-js";
const req = (n: string) => {
    const v = process.env[n];
    if (!v) throw new Error(`${n} missing`);
    return v;
  },
  db = createClient(
    req("NEXT_PUBLIC_SUPABASE_URL"),
    req("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  ),
  now = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now()),
  start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
  end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  month = start.toISOString().slice(0, 10),
  protocol = "cas-shadow-protocol-v1",
  { data: users } = await db.auth.admin.listUsers(),
  output = [];
for (const user of users.users) {
  const [
    { data: cycles },
    { data: recommendations },
    { data: signoffs },
    { data: paper },
    { data: events },
    { data: outcomes },
  ] = await Promise.all([
    db
      .from("pipeline_cycles")
      .select("status")
      .gte("started_at", start.toISOString())
      .lt("started_at", end.toISOString()),
    db
      .from("allocation_recommendations")
      .select("id,status")
      .eq("user_id", user.id)
      .gte("calculated_at", start.toISOString())
      .lt("calculated_at", end.toISOString()),
    db
      .from("analyst_signoffs")
      .select("action,recommendation_id")
      .eq("user_id", user.id)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    db
      .from("paper_portfolios")
      .select("id")
      .eq("user_id", user.id)
      .eq("protocol_version", protocol)
      .maybeSingle(),
    db
      .from("data_quality_events")
      .select("severity")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    db
      .from("recommendation_outcomes")
      .select(
        "portfolio_return_percent,benchmark_return_percent,adverse_excursion_percent,allocation_recommendations!inner(user_id)",
      )
      .eq("allocation_recommendations.user_id", user.id)
      .gte("observed_at", start.toISOString())
      .lt("observed_at", end.toISOString()),
  ]);
  let nav: any[] = [],
    trades: any[] = [],
    analytics = null;
  if (paper) {
    const results = await Promise.all([
      db
        .from("paper_nav")
        .select("nav,calculated_at")
        .eq("paper_portfolio_id", paper.id)
        .gte("calculated_at", start.toISOString())
        .lt("calculated_at", end.toISOString())
        .order("calculated_at"),
      db
        .from("paper_trades")
        .select(
          "fee,slippage,allocation_recommendations(analyst_signoffs(action))",
        )
        .eq("paper_portfolio_id", paper.id)
        .gte("executed_at", start.toISOString())
        .lt("executed_at", end.toISOString()),
      db
        .from("performance_analytics")
        .select("metrics,attribution,calibration")
        .eq("paper_portfolio_id", paper.id)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    nav = results[0].data ?? [];
    trades = results[1].data ?? [];
    analytics = results[2].data;
  }
  const actionCounts = Object.fromEntries(
      ["APPROVE", "MODIFY", "REJECT", "DEFER"].map((a) => [
        a,
        (signoffs ?? []).filter((x) => x.action === a).length,
      ]),
    ),
    successful = (cycles ?? []).filter((x) => x.status === "SUCCEEDED").length,
    total = (cycles ?? []).length,
    overrides = trades.filter((t) =>
      (t.allocation_recommendations as any)?.analyst_signoffs?.some(
        (s: any) => s.action === "MODIFY",
      ),
    ).length,
    decisionMetrics = {
      recommendations: recommendations?.length ?? 0,
      actions: actionCounts,
      paperTrades: trades.length,
      humanOverrides: overrides,
      outcomes: outcomes?.length ?? 0,
      meanAdverseExcursion: outcomes?.length
        ? outcomes.reduce(
            (s, x) => s + Number(x.adverse_excursion_percent),
            0,
          ) / outcomes.length
        : null,
      // A negative outcome is not automatically a false positive: a defensive
      // allocation can be correct while still losing money. Keep that label
      // reserved until recommendations have an explicit directional taxonomy.
      negativeOutcomeRate: outcomes?.length
        ? outcomes.filter((x) => Number(x.portfolio_return_percent) < 0)
            .length / outcomes.length
        : null,
      falsePositiveRate: null,
    },
    operationalMetrics = {
      cycles: total,
      successfulCycles: successful,
      successRate: total ? successful / total : null,
      missedOrFailed: total - successful,
    },
    performanceMetrics = {
      startNav: nav[0]?.nav ?? null,
      endNav: nav.at(-1)?.nav ?? null,
      feesAndSlippage: trades.reduce(
        (s, t) => s + Number(t.fee) + Number(t.slippage),
        0,
      ),
      latestAnalytics: analytics,
    },
    dataQualityMetrics = {
      events: events?.length ?? 0,
      critical: (events ?? []).filter((x) => x.severity === "CRITICAL").length,
    },
    limitations = [
      "Prospective sample only",
      "Small samples prohibit promotion",
      "False-positive classification awaits a reviewed directional taxonomy",
    ];
  const insert = await db.from("monthly_validation_reports").upsert(
    {
      user_id: user.id,
      report_month: month,
      protocol_version: protocol,
      generated_at: now.toISOString(),
      operational_metrics: operationalMetrics,
      decision_metrics: decisionMetrics,
      performance_metrics: performanceMetrics,
      data_quality_metrics: dataQualityMetrics,
      limitations,
      calculation_version: "monthly-validation-v1",
    },
    {
      onConflict: "user_id,report_month,protocol_version,calculation_version",
      ignoreDuplicates: true,
    },
  );
  if (insert.error) throw insert.error;
  output.push({
    user: user.id,
    month,
    recommendations: recommendations?.length ?? 0,
  });
}
console.log(JSON.stringify({ reports: output }, null, 2));
