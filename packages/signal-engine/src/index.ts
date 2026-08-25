export * from "./types";
export * from "./config";
export * from "./regimes";
export * from "./decisions";
export * from "./crypto-credit";
export * from "./market-structure";
export * from "./v3-config";
export * from "./v3-regimes";
export * from "./v3-decisions";
export * from "./validation";
export * from "./availability";
export * from "./allocation";
export * from "./portfolio-risk";

export const SIGNAL_ENGINE_PACKAGE = "@cmip/signal-engine" as const;
/** @deprecated Status of the replayable v2 engine. */
export const SIGNAL_ENGINE_STATUS = "PHASE_4_DECISIONS_ACTIVE" as const;
export const V3_MIGRATION_STATUS =
  "DATA_CONTRACTS_ACTIVE_ENGINE_INACTIVE" as const;
