import {
  PAPER_ASSETS,
  PAPER_NAV_CALCULATION_VERSION,
  DEFAULT_PAPER_COSTS,
  advanceBenchmarks,
  benchmarkStateFromNavRow,
  bookNav,
  dailyCloses,
  planPaperTrades,
  resolveExecutionTargets,
  trailingDailyAverage,
  type ModifiedTargets,
  type PaperBook,
  type TargetRanges,
} from "@cmip/signal-engine";
import {
  calculationTime,
  fetchAllPages,
  listAllUsers,
  serviceClient,
} from "./lib/runtime";

const db = serviceClient();
const at = calculationTime();
const PROTOCOL = "cas-shadow-protocol-v1";
const DAY_MS = 86_400_000;

async function latestValid(code: string) {
  const { data, error } = await db
    .from("canonical_observations")
    .select("id,value,indicators!inner(code)")
    .eq("indicators.code", code)
    .eq("quality_status", "VALID")
    .lte("observed_at", at.toISOString())
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, value: Number(data.value) } : null;
}

/** 200-day average of daily BTC closes (not of the last 200 observations). */
async function btc200DayAverage() {
  const since = new Date(at.getTime() - 230 * DAY_MS).toISOString();
  const rows = await fetchAllPages((from, to) =>
    db
      .from("canonical_observations")
      .select("value,observed_at,indicators!inner(code)")
      .eq("indicators.code", "BTC_USD")
      .eq("quality_status", "VALID")
      .gte("observed_at", since)
      .lte("observed_at", at.toISOString())
      .order("observed_at")
      .range(from, to),
  );
  const closes = dailyCloses(
    rows.map((row) => ({
      observedAt: new Date(row.observed_at),
      value: Number(row.value),
    })),
  );
  return trailingDailyAverage(closes, 200);
}

const [btc, eth, eurUsd, tbill, btc200] = await Promise.all([
  latestValid("BTC_USD"),
  latestValid("ETH_USD"),
  latestValid("EUR_USD"),
  latestValid("US_3M_TBILL_YIELD"),
  btc200DayAverage(),
]);
if (!btc || !eth) throw new Error("Paper prices unavailable");

const out = [];
for (const user of await listAllUsers(db)) {
  const { data: mandate, error: mandateError } = await db
    .from("investor_mandates")
    .select("base_currency")
    .eq("user_id", user.id)
    .lte("effective_at", at.toISOString())
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mandateError) throw mandateError;
  if (!mandate) continue;

  let { data: paper, error: paperError } = await db
    .from("paper_portfolios")
    .select("*")
    .eq("user_id", user.id)
    .eq("protocol_version", PROTOCOL)
    .maybeSingle();
  if (paperError) throw paperError;
  if (!paper) {
    const created = await db
      .from("paper_portfolios")
      .insert({
        user_id: user.id,
        protocol_version: PROTOCOL,
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

  // EUR_USD is quoted as USD per EUR.
  const conversion =
    paper.base_currency === "EUR" ? (eurUsd ? 1 / eurUsd.value : 0) : 1;
  if (!conversion) {
    out.push({ user: user.id, status: "BLOCKED", reason: "FX_MISSING" });
    continue;
  }
  const prices = { BTC: btc.value * conversion, ETH: eth.value * conversion };

  const { data: previous, error: previousError } = await db
    .from("paper_nav")
    .select("*")
    .eq("paper_portfolio_id", paper.id)
    .lte("calculated_at", at.toISOString())
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw previousError;
  const storedPositions = (previous?.positions ?? {}) as Record<
    string,
    unknown
  >;
  let book: PaperBook = {
    cash: previous ? Number(previous.cash) : Number(paper.initial_capital),
    positions: {
      BTC: Number(storedPositions.BTC ?? 0),
      ETH: Number(storedPositions.ETH ?? 0),
    },
  };

  // A freeze on the newest recommendation blocks new exposure; reducing risk
  // remains possible.
  const { data: newest, error: newestError } = await db
    .from("allocation_recommendations")
    .select("id,status")
    .eq("user_id", user.id)
    .lte("calculated_at", at.toISOString())
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (newestError) throw newestError;
  const allowIncreases = newest?.status === "AVAILABLE";

  // The most recent human decision is authoritative, even when the daily
  // cycle has since produced a newer, not yet reviewed recommendation. An
  // older approval never executes after a later REJECT or DEFER.
  const { data: signoff, error: signoffError } = await db
    .from("analyst_signoffs")
    .select(
      "id,action,modified_targets,recommendation_id,allocation_recommendations(id,status,target_ranges)",
    )
    .eq("user_id", user.id)
    .lte("created_at", at.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (signoffError) throw signoffError;
  const approved = signoff?.allocation_recommendations as unknown as {
    id: string;
    status: string;
    target_ranges: TargetRanges;
  } | null;

  let executed = 0;
  let skipped: Array<{ asset: string; reason: string }> = [];
  if (
    signoff &&
    approved?.status === "AVAILABLE" &&
    (signoff.action === "APPROVE" || signoff.action === "MODIFY")
  ) {
    const { data: existing, error: existingError } = await db
      .from("paper_trades")
      .select("asset")
      .eq("paper_portfolio_id", paper.id)
      .eq("recommendation_id", approved.id);
    if (existingError) throw existingError;
    const plan = planPaperTrades({
      book,
      prices,
      targets: resolveExecutionTargets(
        approved.target_ranges,
        signoff.action === "MODIFY"
          ? (signoff.modified_targets as ModifiedTargets | null)
          : null,
      ),
      alreadyExecuted: new Set((existing ?? []).map((x) => String(x.asset))),
      allowIncreases,
    });
    for (const trade of plan.trades) {
      const { error } = await db.from("paper_trades").upsert(
        {
          paper_portfolio_id: paper.id,
          recommendation_id: approved.id,
          asset: trade.asset,
          side: trade.side,
          quantity: trade.quantity,
          price: trade.price,
          fee: trade.fee,
          slippage: trade.slippage,
          executed_at: at.toISOString(),
          execution_rule:
            signoff.action === "MODIFY"
              ? "HUMAN_MODIFIED_RANGE_MIDPOINT"
              : "APPROVED_TARGET_RANGE_MIDPOINT",
        },
        {
          onConflict: "paper_portfolio_id,recommendation_id,asset",
          ignoreDuplicates: true,
        },
      );
      if (error) throw error;
    }
    book = plan.book;
    executed = plan.trades.length;
    skipped = plan.skipped;
  }

  const benchmarks = advanceBenchmarks({
    previous: previous ? benchmarkStateFromNavRow(previous) : null,
    initialCapital: Number(paper.initial_capital),
    prices,
    valuedAt: at,
    annualCashRatePercent: tbill ? tbill.value : null,
    btc200DayAverage: btc200,
    btcPriceForSignal: btc.value,
  });
  const nav = bookNav(book, prices);
  const { error } = await db.from("paper_nav").upsert(
    {
      paper_portfolio_id: paper.id,
      calculated_at: at.toISOString(),
      nav,
      positions: book.positions,
      cash: book.cash,
      benchmark_nav: benchmarks.navs,
      attribution: {
        benchmarkState: benchmarks.state,
        signoffId: signoff?.id ?? null,
        executed: executed > 0,
        trades: executed,
        skipped,
        increasesAllowed: allowIncreases,
        feesModelBps: DEFAULT_PAPER_COSTS.feeRate * 10_000,
        slippageModelBps: DEFAULT_PAPER_COSTS.slippageRate * 10_000,
        btc200: btc200 === null ? null : btc200 * conversion,
        btc200RiskOn: benchmarks.state.dma.riskOn,
      },
      price_observation_ids: [
        btc.id,
        eth.id,
        ...(eurUsd ? [eurUsd.id] : []),
        ...(tbill ? [tbill.id] : []),
      ],
      calculation_version: PAPER_NAV_CALCULATION_VERSION,
    },
    {
      onConflict: "paper_portfolio_id,calculated_at,calculation_version",
      ignoreDuplicates: true,
    },
  );
  if (error) throw error;
  out.push({
    user: user.id,
    status: "VALUED",
    nav,
    trades: executed,
    skipped,
    increasesAllowed: allowIncreases,
  });
}
console.log(
  JSON.stringify(
    {
      calculatedAt: at.toISOString(),
      assets: PAPER_ASSETS,
      paperPortfolios: out,
    },
    null,
    2,
  ),
);
