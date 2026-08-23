import { z } from "zod";
import type {
  DataContract,
  ProviderObservation,
  StoredRawObservation,
} from "./types";

const observationSchema = z.object({
  indicator: z.enum([
    "BTC_USD",
    "ETH_USD",
    "DXY",
    "DXY_PROXY_ECB",
    "US_BROAD_DOLLAR_INDEX",
    "US10Y_REAL",
    "STABLECOIN_SUPPLY_USD",
    "BTC_ETF_NET_FLOW_USD",
    "ETH_ETF_NET_FLOW_USD",
    "US_NET_LIQUIDITY_USD",
    "GLOBAL_LIQUIDITY_USD",
    "DEFI_ACTIVE_LOANS_USD",
    "BTC_MVRV",
    "BTC_REALIZED_LOSSES_USD",
    "BTC_PERPETUAL_OI_USD",
    "BTC_MARKET_CAP_USD",
  ]),
  observedAt: z.date(),
  publishedAt: z.date().optional(),
  revisionAt: z.date().optional(),
  value: z.number().finite(),
  unit: z.string().min(1),
  providerReference: z.string().min(1),
  payload: z.unknown(),
});

export interface ValidationResult {
  quality: StoredRawObservation["quality"];
  reasons: readonly string[];
}

export function validateObservation(
  input: unknown,
  contract: DataContract,
  previous?: ProviderObservation,
): ValidationResult {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success)
    return {
      quality: "REJECTED",
      reasons: parsed.error.issues.map((issue) => issue.message),
    };
  const observation = parsed.data;
  if (observation.indicator !== contract.indicator)
    return { quality: "REJECTED", reasons: ["indicator_mismatch"] };
  if (observation.unit !== contract.unit)
    return { quality: "REJECTED", reasons: ["invalid_unit"] };
  if (
    observation.value < contract.minimum ||
    observation.value > contract.maximum
  )
    return { quality: "QUARANTINED", reasons: ["outside_expected_range"] };
  if (previous && previous.value !== 0) {
    const change =
      Math.abs((observation.value - previous.value) / previous.value) * 100;
    if (change > contract.maxPlausibleChangePercent)
      return { quality: "QUARANTINED", reasons: ["implausible_change"] };
  }
  return { quality: "VALID", reasons: [] };
}

export function freshnessQuality(
  observedAt: Date,
  evaluatedAt: Date,
  contract: DataContract,
): "VALID" | "STALE" {
  return evaluatedAt.getTime() - observedAt.getTime() >
    contract.staleAfterSeconds * 1_000
    ? "STALE"
    : "VALID";
}
