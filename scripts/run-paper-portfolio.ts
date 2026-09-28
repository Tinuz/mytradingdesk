import {
  resolveExecutionTargets,
  type ModifiedRanges,
  type TargetRanges,
} from "@cmip/domain";
import {
  PAPER_ASSETS,
  PAPER_NAV_CALCULATION_VERSION,
  DEFAULT_PAPER_COSTS,
  advanceBenchmarks,
  applyRecordedTrades,
  benchmarkStateFromNavRow,
  bookNav,
  dailyCloses,
  planPaperTrades,
  trailingDailyAverage,
  type PaperBook,
  type PlannedTrade,
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
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, value: Number(data.value) } : null;
}

/**
 * benchmark-v1 signal: the prior complete UTC close against the 200-day
 * average of complete daily closes (not of the last 200 observations).
 */
async function btc200DaySignal() {
  const today = at.toISOString().slice(0, 10);
  const since = new Date(at.getTime() - 230 * DAY_MS).toISOString();
  const rows = await fetchAllPages((from, to) =>
    db
      .from("canonical_observations")
      .select("id,value,observed_at,indicators!inner(code)")
      .eq("indicators.code", "BTC_USD")
      .eq("quality_status", "VALID")
      .gte("observed_at", since)
      .lt("observed_at", `${today}T00:00:00Z`)
      .order("observed_at")
      .order("id")
      .range(from, to),
  );
  const closes = dailyCloses(
    rows.map((row) => ({
      observedAt: new Date(row.observed_at),
      value: Number(row.value),
    })),
  );
  return {
    average: trailingDailyAverage(closes, 200),
    priorClose: closes.at(-1)?.value ?? null,
  };
}

const [btc, eth, eurUsd, tbill, btc200] = await Promise.all([
  latestValid("BTC_USD"),
  latestValid("ETH_USD"),
  latestValid("EUR_USD"),
  latestValid("US_3M_TBILL_YIELD"),
  btc200DaySignal(),
]);
if (!btc || !eth) throw new Error("Paper prices unavailable");

const out = [];
for (const user of await listAllUsers(db)) {
  const { data: mandate, error: mandateError } = await db
    .from("investor_mandates")
    .select("base_currency,minimum_cash_percent")
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

  const { data: previous, error: previousError } = await db
    .from("paper_nav")
    .select("*")
    .eq("paper_portfolio_id", paper.id)
    .lte("calculated_at", at.toISOString())
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw previousError;
  // One valuation per calculation time, whatever version wrote it.
  if (previous && new Date(previous.calculated_at).getTime() === at.getTime()) {
    out.push({ user: user.id, status: "ALREADY_VALUED" });
    continue;
  }

  // EUR_USD is quoted as USD per EUR.
  const conversion =
    paper.base_currency === "EUR" ? (eurUsd ? 1 / eurUsd.value : 0) : 1;
  if (!conversion) {
    out.push({ user: user.id, status: "BLOCKED", reason: "FX_MISSING" });
    continue;
  }
  const prices = { BTC: btc.value * conversion, ETH: eth.value * conversion };
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
      "id,action,created_at,modified_targets,allocation_recommendations!inner(id,status,target_ranges,user_id)",
    )
    .eq("user_id", user.id)
    .eq("allocation_recommendations.user_id", user.id)
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
  // Each decision is processed exactly once: at the first valuation after it
  // was made. Anything skipped then (e.g. blocked by a freeze) needs a new
  // decision rather than executing later at other prices.
  const unprocessed =
    signoff !== null &&
    (!previous ||
      new Date(signoff.created_at) > new Date(previous.calculated_at));

  let tradeCount = 0;
  let skipped: Array<{ asset: string; reason: string }> = [];
  if (
    unprocessed &&
    approved?.status === "AVAILABLE" &&
    (signoff.action === "APPROVE" || signoff.action === "MODIFY")
  ) {
    const { data: recorded, error: recordedError } = await db
      .from("paper_trades")
      .select("asset,side,quantity,price,fee,slippage,executed_at")
      .eq("paper_portfolio_id", paper.id)
      .eq("recommendation_id", approved.id);
    if (recordedError) throw recordedError;
    // Trades recorded after the previous valuation are not in its book yet:
    // a rerun after an interrupted run re-applies them instead of dropping
    // them from the NAV.
    const valuedUntil = previous
      ? new Date(previous.calculated_at).getTime()
      : -Infinity;
    const recordedNow = (recorded ?? [])
      .filter((x) => {
        const executedAt = new Date(x.executed_at).getTime();
        return executedAt > valuedUntil && executedAt <= at.getTime();
      })
      .map((x) => ({
        asset: x.asset as (typeof PAPER_ASSETS)[number],
        side: x.side as PlannedTrade["side"],
        quantity: Number(x.quantity),
        price: Number(x.price),
        fee: Number(x.fee),
        slippage: Number(x.slippage),
      }));
    // A rerun after an interrupted run keeps the trades it already recorded.
    book = applyRecordedTrades(book, recordedNow);
    const plan = planPaperTrades({
      book,
      prices,
      targets: resolveExecutionTargets(
        approved.target_ranges,
        signoff.action === "MODIFY"
          ? (signoff.modified_targets as ModifiedRanges | null)
          : null,
        Number(mandate.minimum_cash_percent),
      ),
      alreadyExecuted: new Set((recorded ?? []).map((x) => String(x.asset))),
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
    tradeCount = recordedNow.length + plan.trades.length;
    skipped = plan.skipped;
  }

  const benchmarks = advanceBenchmarks({
    previous: previous ? benchmarkStateFromNavRow(previous) : null,
    initialCapital: Number(paper.initial_capital),
    prices,
    valuedAt: at,
    annualCashRatePercent: tbill ? tbill.value : null,
    btc200DayAverage: btc200.average,
    btcPriceForSignal: btc200.priorClose ?? btc.value,
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
        processedSignoffId: unprocessed ? signoff.id : null,
        executed: tradeCount > 0,
        trades: tradeCount,
        skipped,
        increasesAllowed: allowIncreases,
        feesModelBps: DEFAULT_PAPER_COSTS.feeRate * 10_000,
        slippageModelBps: DEFAULT_PAPER_COSTS.slippageRate * 10_000,
        btc200: btc200.average === null ? null : btc200.average * conversion,
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
    trades: tradeCount,
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
