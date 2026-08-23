import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/202608220001_phase_0_foundation.sql"),
  "utf8",
);
const ingestionMigration = readFileSync(
  resolve("supabase/migrations/202608220002_phase_1_ingestion.sql"),
  "utf8",
);
const idempotencyMigration = readFileSync(
  resolve("supabase/migrations/202608220003_canonical_idempotency.sql"),
  "utf8",
);
const liquidityMigration = readFileSync(
  resolve("supabase/migrations/202608220004_phase_2_liquidity.sql"),
  "utf8",
);
const regimeMigration = readFileSync(
  resolve("supabase/migrations/202608220005_phase_3_engine_version.sql"),
  "utf8",
);
const decisionMigration = readFileSync(
  resolve("supabase/migrations/202608220006_phase_4_decision_engine.sql"),
  "utf8",
);
const historyMigration = readFileSync(
  resolve("supabase/migrations/202608220007_phase_5_snapshot_history.sql"),
  "utf8",
);
const experienceMigration = readFileSync(
  resolve("supabase/migrations/202608220008_phase_5_experience_views.sql"),
  "utf8",
);
const v3Migration = readFileSync(
  resolve("supabase/migrations/202608220009_v3_model_reset.sql"),
  "utf8",
);
const globalLiquidityMigration = readFileSync(
  resolve("supabase/migrations/202608220010_v3_global_liquidity.sql"),
  "utf8",
);
const cryptoCreditMigration = readFileSync(
  resolve("supabase/migrations/202608220011_v3_crypto_credit_contracts.sql"),
  "utf8",
);
const marketStructureMigration = readFileSync(
  resolve("supabase/migrations/202608220012_v3_market_structure_contracts.sql"),
  "utf8",
);
const v3RegimeMigration = readFileSync(
  resolve("supabase/migrations/202608220013_v3_regime_engine.sql"),
  "utf8",
);
const v3DecisionMigration = readFileSync(
  resolve("supabase/migrations/202608220014_v3_decision_engine.sql"),
  "utf8",
);
const v3AlertMigration = readFileSync(
  resolve("supabase/migrations/202608220015_v3_alerts.sql"),
  "utf8",
);
const validationTrustMigration = readFileSync(
  resolve("supabase/migrations/202608220016_validation_trust.sql"),
  "utf8",
);
const validationReplayMigration = readFileSync(
  resolve("supabase/migrations/202608220017_validation_replay.sql"),
  "utf8",
);
const pointInTimeMigration = readFileSync(
  resolve("supabase/migrations/202608220018_point_in_time_audit.sql"),
  "utf8",
);
const v1OperatingMigration = readFileSync(
  resolve("supabase/migrations/202608220019_v1_operating_system.sql"),
  "utf8",
);
const dollarValidationMigration = readFileSync(
  resolve("supabase/migrations/202608230020_dollar_strength_validation.sql"),
  "utf8",
);
const dollarActivationMigration = readFileSync(
  resolve(
    "supabase/migrations/202608230021_activate_ecb_dollar_hypothesis.sql",
  ),
  "utf8",
);
const requiredTables = [
  "assets",
  "providers",
  "indicators",
  "raw_observations",
  "canonical_observations",
  "indicator_snapshots",
  "regime_snapshots",
  "decision_snapshots",
  "alerts",
  "ingestion_runs",
  "data_quality_events",
  "engine_versions",
];

describe("Phase 0 migration", () => {
  it.each(requiredTables)("creates %s", (table) => {
    expect(migration).toContain(`create table public.${table}`);
  });

  it("enables RLS on every public application table", () => {
    for (const table of requiredTables) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("makes provider observations idempotent", () => {
    expect(migration).toContain(
      "unique (provider_id, indicator_id, observed_at, provider_reference)",
    );
  });

  it("does not define destructive mutation access for raw observations", () => {
    expect(migration).not.toMatch(
      /policy[^;]+raw_observations[^;]+for (update|delete)/i,
    );
  });
});

describe("Phase 2 migration", () => {
  it.each([
    "STABLECOIN_SUPPLY_USD",
    "BTC_ETF_NET_FLOW_USD",
    "ETH_ETF_NET_FLOW_USD",
    "US_NET_LIQUIDITY_USD",
  ])("seeds %s contract", (indicator) => {
    expect(liquidityMigration).toContain(`('${indicator}'`);
  });
  it("documents the liquidity formula and units", () => {
    expect(liquidityMigration).toContain("WALCL/1000-WTREGEN/1000-RRPONTSYD");
    expect(liquidityMigration).toContain("assumptionStatus");
  });
});

describe("Phase 3 migration", () => {
  it("registers a hypothesis engine version without activating decisions", () => {
    expect(regimeMigration).toContain("0.3.0-hypothesis.1");
    expect(regimeMigration).toContain('"decisionEngineActive":false');
  });
});

describe("Phase 4 migration", () => {
  it("registers the decision engine while keeping alerts inactive", () => {
    expect(decisionMigration).toContain("0.4.0-hypothesis.1");
    expect(decisionMigration).toContain('"decisionEngineActive":true');
    expect(decisionMigration).toContain('"alertsActive":false');
  });
  it("makes regime and decision snapshots idempotent", () => {
    expect(decisionMigration).toContain("regime_snapshots_idempotency");
    expect(decisionMigration).toContain("decision_snapshots_idempotency");
  });
});

describe("Phase 5 history migration", () => {
  it("persists deterministic transition memory for replay", () => {
    expect(historyMigration).toContain("candidate_state");
    expect(historyMigration).toContain("pending_state");
    expect(historyMigration).toContain("consecutive_observations");
    expect(historyMigration).toContain("transition_reason");
  });
});

describe("Phase 5 experience migration", () => {
  it("exposes authenticated decision history and indicator health without raw payloads", () => {
    expect(experienceMigration).toContain(
      "decision_experience with (security_invoker = true)",
    );
    expect(experienceMigration).toContain(
      "indicator_health with (security_invoker = true)",
    );
    expect(experienceMigration).not.toContain("raw_payload");
  });
  it("keeps operational health behind authentication", () => {
    expect(experienceMigration).toContain(
      'policy "authenticated users read ingestion runs"',
    );
    expect(experienceMigration).toContain(
      'policy "authenticated users read quality events"',
    );
  });
});

describe("Phase 1 migration", () => {
  it("captures publication and revision timing", () => {
    expect(ingestionMigration).toContain("add column published_at");
    expect(ingestionMigration).toContain("add column revision_at");
  });
  it("enforces raw and canonical immutability in PostgreSQL", () => {
    expect(ingestionMigration).toContain(
      "create trigger raw_observations_immutable",
    );
    expect(ingestionMigration).toContain(
      "create trigger canonical_observations_immutable",
    );
  });
  it("makes canonical insertion idempotent by source observation", () => {
    expect(ingestionMigration).toContain(
      "canonical_observations_source_unique",
    );
    expect(idempotencyMigration).toContain("unique (source_observation_id)");
  });
  it.each(["BTC_USD", "ETH_USD", "DXY", "US10Y_REAL"])(
    "seeds %s contract",
    (indicator) => {
      expect(ingestionMigration).toContain(`('${indicator}'`);
    },
  );
});

describe("V3 model migration", () => {
  it("resets derived state but preserves source observations", () => {
    expect(v3Migration).toContain(
      "truncate table public.alerts, public.decision_snapshots, public.regime_snapshots",
    );
    expect(v3Migration).not.toMatch(
      /truncate table[^;]*(raw_observations|canonical_observations)/i,
    );
  });

  it.each([
    "MACRO_LIQUIDITY",
    "CRYPTO_CREDIT_LIQUIDITY",
    "MARKET_STRUCTURE",
    "ASSET",
  ])("supports the %s layer", (layer) => {
    expect(v3Migration).toContain(`'${layer}'`);
  });

  it("requires market structure for every new decision", () => {
    expect(v3Migration).toContain("market_structure_snapshot_id uuid not null");
    expect(v3Migration).toContain("join public.regime_snapshots ms");
  });

  it("stores explicit factor classification metadata", () => {
    expect(v3Migration).toContain("factor_classification");
    expect(v3Migration).toContain("classification_status");
    expect(v3Migration).toContain("'HYPOTHESIS', 'VALIDATED'");
  });
});

describe("V3 global liquidity migration", () => {
  it("registers the transparent G3 proxy and methodology", () => {
    expect(globalLiquidityMigration).toContain("GLOBAL_LIQUIDITY_USD");
    expect(globalLiquidityMigration).toContain(
      "WALCL/1000 + ECBASSETSW*DEXUSEU/1000 + JPNASSETS*0.1/DEXJPUS",
    );
    expect(globalLiquidityMigration).toContain("excludes China/PBoC");
  });

  it("classifies global liquidity as a leading hypothesis", () => {
    expect(globalLiquidityMigration).toContain(
      "'GLOBAL_LIQUIDITY', 'LEADING', 'HYPOTHESIS', 'FRED'",
    );
  });
});

describe("Dollar-strength shadow validation", () => {
  it.each(["DXY_PROXY_ECB", "US_BROAD_DOLLAR_INDEX"])(
    "registers %s separately from official DXY",
    (indicator) => {
      expect(dollarValidationMigration).toContain(`'${indicator}'`);
    },
  );
  it("documents that neither shadow series silently replaces official DXY", () => {
    expect(dollarValidationMigration).toContain('"officialDxy":false');
    expect(dollarValidationMigration).toContain("not an exact DXY substitute");
    expect(dollarValidationMigration).toContain(
      '"activationStatus":"SHADOW_VALIDATION"',
    );
  });
  it("compares thirty-day direction without mixing index levels", () => {
    expect(dollarValidationMigration).toContain("proxy_change_30d_percent");
    expect(dollarValidationMigration).toContain("direction_agreement_30d");
  });
});

describe("ECB dollar-strength hypothesis activation", () => {
  it("activates a separately named capped factor, not official DXY", () => {
    expect(dollarActivationMigration).toContain(
      '"regimeFactor":"DOLLAR_STRENGTH_ECB_90D"',
    );
    expect(dollarActivationMigration).toContain('"maximumAbsoluteScore":1');
    expect(dollarActivationMigration).toContain('"officialDxy":false');
  });
  it("versions both regime and decision behavior", () => {
    expect(dollarActivationMigration).toContain("0.5.1-hypothesis.1");
    expect(dollarActivationMigration).toContain("0.6.1-hypothesis.1");
    expect(dollarActivationMigration).toContain("divergenceLowersConfidence");
  });
});

describe("V3 crypto credit contracts", () => {
  it.each([
    "DEFI_ACTIVE_LOANS_USD",
    "STABLECOIN_GROWTH_30D_PERCENT",
    "STABLECOIN_GROWTH_90D_PERCENT",
    "STABLECOIN_GROWTH_ACCELERATION_PP",
    "BTC_ETF_FLOW_20D_USD",
    "ETH_ETF_FLOW_20D_USD",
    "DEFI_LOANS_GROWTH_30D_PERCENT",
  ])("registers %s", (indicator) => {
    expect(cryptoCreditMigration).toContain(`'${indicator}'`);
  });
  it("persists the fixed lending universe and its limitation", () => {
    expect(cryptoCreditMigration).toContain("defillama-fixed-universe-v1");
    expect(cryptoCreditMigration).toContain(
      "fixed universe is not all DeFi lending",
    );
  });
});

describe("V3 market structure contracts", () => {
  it.each([
    "BTC_MVRV",
    "BTC_REALIZED_LOSSES_USD",
    "BTC_PERPETUAL_OI_USD",
    "BTC_MARKET_CAP_USD",
    "BTC_OI_MARKET_CAP_RATIO",
    "BTC_OI_DRAWDOWN_FROM_HIGH_PERCENT",
  ])("registers %s", (indicator) =>
    expect(marketStructureMigration).toContain(`'${indicator}'`),
  );
  it("versions the fixed OI universe", () => {
    expect(marketStructureMigration).toContain(
      "coinalyze-btc-perp-fixed-universe-v1",
    );
    expect(marketStructureMigration).toContain('"convertToUsd":true');
  });
});
describe("V3 regime engine migration", () => {
  it("activates regimes without activating decisions or alerts", () => {
    expect(v3RegimeMigration).toContain("0.5.0-hypothesis.2");
    expect(v3RegimeMigration).toContain('"regimeEngineActive":true');
    expect(v3RegimeMigration).toContain('"decisionEngineActive":false');
    expect(v3RegimeMigration).toContain('"alertsActive":false');
  });
});
describe("V3 decision engine migration", () => {
  it("activates 625 decisions and keeps alerts off", () => {
    expect(v3DecisionMigration).toContain("0.6.0-hypothesis.1");
    expect(v3DecisionMigration).toContain('"matrixCombinations":625');
    expect(v3DecisionMigration).toContain('"decisionEngineActive":true');
    expect(v3DecisionMigration).toContain('"alertsActive":false');
  });
  it("persists and exposes risk overrides", () => {
    expect(v3DecisionMigration).toContain("risk_override text");
    expect(v3DecisionMigration).toContain("d.risk_override");
  });
});
describe("V3 alert engine migration", () => {
  it("activates alerts with a live-only watermark", () => {
    expect(v3AlertMigration).toContain("0.7.0-hypothesis.1");
    expect(v3AlertMigration).toContain('"alertEngineActive":true');
    expect(v3AlertMigration).toContain('"historicalAlerts":false');
    expect(v3AlertMigration).toContain("live_since");
  });
  it("provides per-user preferences and a protected inbox", () => {
    expect(v3AlertMigration).toContain("notification_preferences");
    expect(v3AlertMigration).toContain(
      "notification_inbox with(security_invoker=true)",
    );
    expect(v3AlertMigration).toContain(
      "users read own notification preferences",
    );
  });
});
describe("Validation and trust migration", () => {
  it("includes canonical and derived observations in health", () => {
    expect(validationTrustMigration).toContain("'CANONICAL'::text source_type");
    expect(validationTrustMigration).toContain("'DERIVED'::text");
    expect(validationTrustMigration).toContain("indicator_snapshots");
  });
  it("marks model and stale decisions truthfully", () => {
    expect(validationTrustMigration).toContain(
      "'UNVALIDATED'::text model_validation_status",
    );
    expect(validationTrustMigration).toContain("interval '30 minutes'");
    expect(validationTrustMigration).toContain("snapshot_freshness");
  });
  it("persists longitudinal trust observations", () => {
    expect(validationTrustMigration).toContain(
      "create table public.trust_observations",
    );
    expect(validationTrustMigration).toContain("unique(observation_date)");
    expect(validationTrustMigration).toContain(
      "create table public.model_runs",
    );
  });
});
describe("Validation replay migration", () => {
  it("distinguishes reconstructed from point-in-time evidence", () => {
    expect(validationReplayMigration).toContain(
      "'RECONSTRUCTED','POINT_IN_TIME'",
    );
    expect(validationReplayMigration).toContain("limitations jsonb");
  });
  it("stores immutable daily decisions and outcomes", () => {
    expect(validationReplayMigration).toContain("validation_replay_points");
    expect(validationReplayMigration).toContain("forward_returns jsonb");
    expect(validationReplayMigration).toContain("adverse_excursions jsonb");
    expect(validationReplayMigration).toContain(
      "unique(replay_run_id,evaluation_date,asset_id)",
    );
  });
});
describe("Point-in-time audit migration", () => {
  it("never treats observation date as availability proof", () => {
    expect(pointInTimeMigration).toContain("RECEIVED_AT");
    expect(pointInTimeMigration).toContain("CALCULATED_AT");
    expect(pointInTimeMigration).toContain(
      "Observation date alone is never availability proof",
    );
  });
  it("persists blockers per indicator", () => {
    expect(pointInTimeMigration).toContain("point_in_time_indicator_results");
    expect(pointInTimeMigration).toContain("late_observations");
    expect(pointInTimeMigration).toContain("point_in_time_status");
  });
});
describe("V1 operating system migration", () => {
  it("tracks complete cycles and provider budgets", () => {
    expect(v1OperatingMigration).toContain(
      "create table public.pipeline_cycles",
    );
    expect(v1OperatingMigration).toContain("provider_budget_policies");
    expect(v1OperatingMigration).toContain("heartbeat_status");
  });
  it("freezes promotion criteria before observation", () => {
    expect(v1OperatingMigration).toContain("v1-shadow-protocol.1");
    expect(v1OperatingMigration).toContain('"minimumShadowDays":90');
    expect(v1OperatingMigration).toContain(
      '"thresholdChangesDuringWindow":false',
    );
  });
  it("keeps the investor journal user-owned", () => {
    expect(v1OperatingMigration).toContain("investor_journal_entries");
    expect(v1OperatingMigration).toContain("users read own journal");
    expect(v1OperatingMigration).toContain("auth.uid())=user_id");
  });
  it("persists release gates without automatic promotion", () => {
    expect(v1OperatingMigration).toContain("v1_gate_assessments");
    expect(v1OperatingMigration).not.toContain(
      "update public.engine_versions set",
    );
  });
});
