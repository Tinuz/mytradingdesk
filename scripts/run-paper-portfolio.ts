import { createClient } from "@supabase/supabase-js";
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
  at = new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now()),
  protocol = "cas-shadow-protocol-v1";
async function quote(code: string) {
  const { data } = await c
    .from("canonical_observations")
    .select("id,value,observed_at,indicators!inner(code)")
    .eq("indicators.code", code)
    .lte("observed_at", at.toISOString())
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, value: Number(data.value) } : null;
}
async function movingAverage(code: string, days: number) {
  const { data } = await c
    .from("canonical_observations")
    .select("value,observed_at,indicators!inner(code)")
    .eq("indicators.code", code)
    .lt("observed_at", at.toISOString())
    .order("observed_at", { ascending: false })
    .limit(days);
  return data?.length === days
    ? data.reduce((sum, row) => sum + Number(row.value), 0) / days
    : null;
}
const [b, e, fx, rate, btc200] = await Promise.all([
  quote("BTC_USD"),
  quote("ETH_USD"),
  quote("EUR_USD"),
  quote("US_3M_TBILL_YIELD"),
  movingAverage("BTC_USD", 200),
]);
if (!b || !e) throw new Error("Paper prices unavailable");
const { data: users } = await c.auth.admin.listUsers(),
  out = [];
for (const user of users.users) {
  const { data: mandate } = await c
    .from("investor_mandates")
    .select("*")
    .eq("user_id", user.id)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!mandate) continue;
  let { data: paper } = await c
    .from("paper_portfolios")
    .select("*")
    .eq("user_id", user.id)
    .eq("protocol_version", protocol)
    .maybeSingle();
  if (!paper) {
    const created = await c
      .from("paper_portfolios")
      .insert({
        user_id: user.id,
        protocol_version: protocol,
        base_currency: mandate.base_currency,
        started_at: at.toISOString(),
        status: "ACTIVE",
        initial_capital: 100000,
      })
      .select("*")
      .single();
    if (created.error) throw created.error;
    paper = created.data;
  }
  const conversion =
    paper.base_currency === "EUR" ? (fx ? 1 / fx.value : 0) : 1;
  if (!conversion) {
    out.push({ user: user.id, status: "BLOCKED", reason: "FX_MISSING" });
    continue;
  }
  const prices = { BTC: b.value * conversion, ETH: e.value * conversion },
    { data: previous } = await c
      .from("paper_nav")
      .select("*")
      .eq("paper_portfolio_id", paper.id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  let positions = previous
      ? (previous.positions as Record<string, number>)
      : { BTC: 0, ETH: 0 },
    cash = previous ? Number(previous.cash) : Number(paper.initial_capital),
    nav = cash + positions.BTC * prices.BTC + positions.ETH * prices.ETH;
  const { data: recommendation } = await c
    .from("allocation_recommendations")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "AVAILABLE")
    .lte("calculated_at", at.toISOString())
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let executed = false;
  if (recommendation) {
    // The most recent human decision is authoritative. Never fall back to an
    // older approval after a later REJECT or DEFER.
    const { data: approval } = await c
      .from("analyst_signoffs")
      .select("id,action,modified_targets,created_at")
      .eq("recommendation_id", recommendation.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (approval && ["APPROVE", "MODIFY"].includes(approval.action)) {
      const { data: existingTrades, error: existingTradesError } = await c
        .from("paper_trades")
        .select("asset")
        .eq("paper_portfolio_id", paper.id)
        .eq("recommendation_id", recommendation.id);
      if (existingTradesError) throw existingTradesError;
      const alreadyExecuted = new Set(
        (existingTrades ?? []).map((trade) => String(trade.asset)),
      );
      const original = recommendation.target_ranges as Record<
          string,
          { minimum: number; maximum: number; midpoint: number }
        >,
        modified = (approval.modified_targets ?? {}) as Record<
          string,
          { minimum: number; maximum: number; midpoint?: number }
        >,
        targets = Object.fromEntries(
          Object.entries(original).map(([asset, target]) => {
            const change = modified[asset];
            return [
              asset,
              change
                ? {
                    ...change,
                    midpoint:
                      change.midpoint ??
                      (Number(change.minimum) + Number(change.maximum)) / 2,
                  }
                : target,
            ];
          }),
        ) as Record<string, { midpoint: number }>;
      const planned = (["BTC", "ETH"] as const)
        .filter((asset) => !alreadyExecuted.has(asset))
        .map((asset) => {
          const current = positions[asset] * prices[asset];
          return {
            asset,
            delta: (nav * (targets[asset]?.midpoint ?? 0)) / 100 - current,
          };
        })
        // Sales fund purchases; deterministic secondary order keeps reruns
        // reproducible when both deltas have the same sign.
        .sort((a, b) => a.delta - b.delta || a.asset.localeCompare(b.asset));
      for (const plan of planned) {
        const { asset } = plan;
        // A recommendation is applied once per asset. This check occurs before
        // any in-memory balance mutation, keeping reruns idempotent.
        let delta = plan.delta;
        if (Math.abs(delta) < nav * 0.01) continue;
        if (delta > 0) {
          const targetCash = (nav * Number(targets.CASH?.midpoint ?? 0)) / 100,
            availableForTrade = Math.max(0, cash - targetCash),
            maximumPurchase = availableForTrade / 1.0015;
          delta = Math.min(delta, maximumPurchase);
          if (delta < nav * 0.01) continue;
        }
        const fee = Math.abs(delta) * 0.001,
          slippage = Math.abs(delta) * 0.0005,
          quantity = Math.abs(delta) / prices[asset];
        positions = {
          ...positions,
          [asset]: positions[asset] + Math.sign(delta) * quantity,
        };
        cash -= delta + fee + slippage;
        const { error } = await c.from("paper_trades").upsert(
          {
            paper_portfolio_id: paper.id,
            recommendation_id: recommendation.id,
            asset,
            side: delta > 0 ? "INCREASE" : "DECREASE",
            quantity,
            price: prices[asset],
            fee,
            slippage,
            executed_at: at.toISOString(),
            execution_rule:
              approval.action === "MODIFY"
                ? "HUMAN_MODIFIED_RANGE_MIDPOINT"
                : "APPROVED_TARGET_RANGE_MIDPOINT",
          },
          {
            onConflict: "paper_portfolio_id,recommendation_id,asset",
            ignoreDuplicates: true,
          },
        );
        if (error) throw error;
        executed = true;
      }
    }
  }
  nav = cash + positions.BTC * prices.BTC + positions.ETH * prices.ETH;
  const firstAttribution = previous
      ? (previous.attribution as Record<string, unknown>)
      : {
          anchors: {
            BTC: prices.BTC,
            ETH: prices.ETH,
            capital: Number(paper.initial_capital),
          },
        },
    anchors = (firstAttribution.anchors ?? {
      BTC: prices.BTC,
      ETH: prices.ETH,
      capital: Number(paper.initial_capital),
    }) as Record<string, number>,
    cashDaily = rate
      ? Number(paper.initial_capital) *
        0.5 *
        (Number(rate.value) / 100 / 365) *
        ((at.getTime() - new Date(paper.started_at).getTime()) / 864e5)
      : null,
    priorBenchmarks = (previous?.benchmark_nav ?? {}) as Record<
      string,
      number | null
    >,
    priorBtc = Number(
      (previous?.attribution as Record<string, unknown> | null)?.lastBtcPrice ??
        anchors.BTC,
    ),
    dmaWasRiskOn = Boolean(
      (previous?.attribution as Record<string, unknown> | null)?.btc200RiskOn ??
      false,
    ),
    priorDmaNav = Number(priorBenchmarks.BTC_200DMA ?? anchors.capital),
    dailyCashReturn = rate ? Number(rate.value) / 100 / 365 : 0,
    btcDailyReturn = priorBtc > 0 ? prices.BTC / priorBtc - 1 : 0,
    benchmarks = {
      BTC_HOLD: (anchors.capital * prices.BTC) / anchors.BTC,
      BTC_ETH_60_40:
        anchors.capital *
        ((0.6 * prices.BTC) / anchors.BTC + (0.4 * prices.ETH) / anchors.ETH),
      BTC_CASH_50_50:
        cashDaily === null
          ? null
          : (anchors.capital * 0.5 * prices.BTC) / anchors.BTC +
            anchors.capital * 0.5 +
            cashDaily,
      BTC_200DMA:
        btc200 === null
          ? null
          : priorDmaNav *
            (1 + (dmaWasRiskOn ? btcDailyReturn : dailyCashReturn)),
    };
  const { error } = await c.from("paper_nav").upsert(
    {
      paper_portfolio_id: paper.id,
      calculated_at: at.toISOString(),
      nav,
      positions,
      cash,
      benchmark_nav: benchmarks,
      attribution: {
        anchors,
        executed,
        feesModelBps: 10,
        slippageModelBps: 5,
        lastBtcPrice: prices.BTC,
        btc200: btc200 === null ? null : btc200 * conversion,
        btc200RiskOn: btc200 !== null && b.value > btc200,
      },
      price_observation_ids: [
        b.id,
        e.id,
        ...(fx ? [fx.id] : []),
        ...(rate ? [rate.id] : []),
      ],
      calculation_version: "paper-nav-v1",
    },
    {
      onConflict: "paper_portfolio_id,calculated_at,calculation_version",
      ignoreDuplicates: true,
    },
  );
  if (error) throw error;
  out.push({ user: user.id, status: "VALUED", nav, executed });
}
console.log(
  JSON.stringify(
    { calculatedAt: at.toISOString(), paperPortfolios: out },
    null,
    2,
  ),
);
