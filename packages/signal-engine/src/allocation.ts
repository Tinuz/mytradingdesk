import type {
  AssetSymbol,
  InvestmentRegime,
  MarketStructureRegime,
} from "@cmip/domain";
export const ALLOCATION_POLICY_VERSION =
  "allocation-policy-v1-shadow.1" as const;
const opportunity: Record<InvestmentRegime, number> = {
  DEFENSIVE: 5,
  RISK_REDUCTION: 15,
  NEUTRAL: 25,
  ACCUMULATION: 40,
  STRONG_ACCUMULATION: 55,
};
const stressCap: Record<MarketStructureRegime, number> = {
  CAPITULATION: 20,
  STRESSED: 30,
  HEALTHY: 100,
  ELEVATED_RISK: 45,
  OVERHEATED: 35,
};
export interface AllocationAssetInput {
  asset: AssetSymbol;
  opportunityState: InvestmentRegime;
  stressState: MarketStructureRegime;
  expectedReturnPercent: number | null;
  thesisActive: boolean;
  dataApproved: boolean;
  frozen: boolean;
}
export interface AllocationMandateInput {
  minimumCashPercent: number;
  maximumAssetWeightPercent: number;
  allowedAssets: readonly AssetSymbol[];
}
type Target = {
  minimum: number;
  maximum: number;
  midpoint: number;
  reasons: string[];
};
export interface AllocationResult {
  status: "AVAILABLE" | "NO_FEASIBLE_ALLOCATION" | "FROZEN";
  version: typeof ALLOCATION_POLICY_VERSION;
  targets: Record<AssetSymbol, Target>;
  cash: { minimum: number; maximum: number; midpoint: number };
  bindingConstraints: string[];
  warnings: string[];
}
export function allocateShadowPortfolio(
  assets: readonly AllocationAssetInput[],
  mandate: AllocationMandateInput,
): AllocationResult {
  const empty: Record<AssetSymbol, Target> = {
    BTC: { minimum: 0, maximum: 0, midpoint: 0, reasons: [] },
    ETH: { minimum: 0, maximum: 0, midpoint: 0, reasons: [] },
  };
  if (
    mandate.minimumCashPercent < 0 ||
    mandate.minimumCashPercent > 100 ||
    mandate.maximumAssetWeightPercent <= 0
  )
    return {
      status: "NO_FEASIBLE_ALLOCATION",
      version: ALLOCATION_POLICY_VERSION,
      targets: empty,
      cash: { minimum: 100, maximum: 100, midpoint: 100 },
      bindingConstraints: ["INVALID_MANDATE"],
      warnings: [],
    };
  const warnings: string[] = [],
    binding: string[] = [];
  let frozen = false;
  const desired: Record<AssetSymbol, number> = { BTC: 0, ETH: 0 };
  for (const x of assets) {
    if (!mandate.allowedAssets.includes(x.asset)) {
      binding.push(`${x.asset}:NOT_ALLOWED`);
      continue;
    }
    if (x.frozen || !x.dataApproved) {
      frozen = true;
      warnings.push(
        `${x.asset}:${x.frozen ? "FREEZE_ACTIVE" : "SOURCE_NOT_APPROVED"}`,
      );
      continue;
    }
    if (!x.thesisActive) {
      binding.push(`${x.asset}:NO_ACTIVE_THESIS`);
      continue;
    }
    let value = opportunity[x.opportunityState];
    if (x.expectedReturnPercent !== null)
      value +=
        x.expectedReturnPercent >= 30
          ? 10
          : x.expectedReturnPercent <= 0
            ? -10
            : 0;
    value = Math.max(
      0,
      Math.min(
        value,
        stressCap[x.stressState],
        mandate.maximumAssetWeightPercent,
      ),
    );
    desired[x.asset] = value;
    if (value === stressCap[x.stressState])
      binding.push(`${x.asset}:STRESS_CAP`);
    if (value === mandate.maximumAssetWeightPercent)
      binding.push(`${x.asset}:ASSET_CAP`);
  }
  const riskyCap = 100 - mandate.minimumCashPercent,
    total = desired.BTC + desired.ETH,
    scale = total > riskyCap && total > 0 ? riskyCap / total : 1;
  if (scale < 1) binding.push("TOTAL_RISK_CAP");
  const targets: Record<AssetSymbol, Target> = { ...empty };
  for (const asset of ["BTC", "ETH"] as const) {
    const midpoint = Number((desired[asset] * scale).toFixed(2));
    targets[asset] = {
      minimum: Math.max(0, midpoint - 5),
      maximum: Math.min(mandate.maximumAssetWeightPercent, midpoint + 5),
      midpoint,
      reasons: binding.filter((x) => x.startsWith(asset)),
    };
  }
  const risky = targets.BTC.midpoint + targets.ETH.midpoint,
    cash = 100 - risky;
  return {
    status: frozen ? "FROZEN" : "AVAILABLE",
    version: ALLOCATION_POLICY_VERSION,
    targets,
    cash: {
      minimum: Math.max(mandate.minimumCashPercent, cash - 5),
      maximum: Math.min(100, cash + 5),
      midpoint: cash,
    },
    bindingConstraints: binding,
    warnings,
  };
}
