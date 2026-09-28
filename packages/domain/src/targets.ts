import type { AssetSymbol } from "./index";

/**
 * Target-range rules shared by the sign-off form (validation) and the paper
 * engine (execution), so both always agree on what a decision means.
 */
export interface TargetRange {
  minimum: number;
  maximum: number;
  midpoint: number;
}
export type TargetRanges = Record<string, TargetRange>;
/** A human MODIFY decision: new ranges for some assets. */
export type ModifiedRanges = Record<
  string,
  { minimum: number; maximum: number }
>;
export interface TargetMandate {
  minimumCashPercent: number;
  maximumAssetWeightPercent: number;
  allowedAssets: readonly string[];
}

const TARGET_ASSETS: readonly AssetSymbol[] = ["BTC", "ETH"];

/**
 * Execution targets for a decision. Modified assets execute at the middle of
 * their new range (any supplied midpoint is ignored); other assets keep the
 * model midpoint. After a modification the cash target is whatever the asset
 * midpoints leave, but never less than the mandate's minimum cash: asset
 * midpoints are scaled down proportionally when they would breach it.
 */
export function resolveExecutionTargets(
  original: TargetRanges,
  modified: ModifiedRanges | null,
  minimumCashPercent: number,
): TargetRanges {
  const assets: TargetRanges = {};
  for (const asset of TARGET_ASSETS) {
    const change = modified?.[asset];
    const base = original[asset];
    if (change) {
      const minimum = Number(change.minimum);
      const maximum = Number(change.maximum);
      assets[asset] = { minimum, maximum, midpoint: (minimum + maximum) / 2 };
    } else if (base) assets[asset] = { ...base };
  }
  if (!modified) return { ...original, ...assets };
  const risky = Object.values(assets).reduce((sum, x) => sum + x.midpoint, 0);
  const riskyCap = Math.max(0, 100 - minimumCashPercent);
  if (risky > riskyCap && risky > 0)
    for (const target of Object.values(assets))
      target.midpoint = (target.midpoint * riskyCap) / risky;
  const cash = 100 - Math.min(risky, riskyCap);
  return { ...assets, CASH: { minimum: cash, maximum: cash, midpoint: cash } };
}

/** Reasons a MODIFY decision is not allowed; empty when it is valid. */
export function modifiedTargetViolations(
  original: TargetRanges,
  modified: ModifiedRanges,
  mandate: TargetMandate,
): string[] {
  const entries = Object.entries(modified);
  if (!entries.length) return ["NO_CHANGES"];
  const violations: string[] = [];
  for (const [asset, range] of entries) {
    const minimum = Number(range?.minimum);
    const maximum = Number(range?.maximum);
    if (
      !TARGET_ASSETS.includes(asset as AssetSymbol) ||
      !mandate.allowedAssets.includes(asset)
    )
      violations.push(`${asset}:NOT_ALLOWED`);
    else if (
      !Number.isFinite(minimum) ||
      !Number.isFinite(maximum) ||
      minimum < 0 ||
      maximum < minimum
    )
      violations.push(`${asset}:INVALID_RANGE`);
    else if (maximum > mandate.maximumAssetWeightPercent)
      violations.push(`${asset}:ABOVE_ASSET_CAP`);
  }
  if (violations.length) return violations;
  // Judge the cash floor with exactly the midpoints execution would use,
  // before execution's own defensive scaling.
  const risky = TARGET_ASSETS.reduce((sum, asset) => {
    const change = modified[asset];
    const midpoint = change
      ? (Number(change.minimum) + Number(change.maximum)) / 2
      : Number(original[asset]?.midpoint ?? 0);
    return sum + midpoint;
  }, 0);
  const riskyMinimum = TARGET_ASSETS.reduce(
    (sum, asset) =>
      sum + Number(modified[asset]?.minimum ?? original[asset]?.minimum ?? 0),
    0,
  );
  if (
    risky > 100 - mandate.minimumCashPercent ||
    riskyMinimum > 100 - mandate.minimumCashPercent
  )
    violations.push("CASH_FLOOR");
  return violations;
}

/** Same minimum, maximum and midpoint for every target; a missing target differs. */
export function sameTargetRanges(a: unknown, b: unknown): boolean {
  const left = (a ?? {}) as Record<string, Partial<TargetRange>>;
  const right = (b ?? {}) as Record<string, Partial<TargetRange>>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const close = (x: unknown, y: unknown) =>
    x != null && y != null && Math.abs(Number(x) - Number(y)) < 0.01;
  return [...keys].every(
    (key) =>
      close(left[key]?.minimum, right[key]?.minimum) &&
      close(left[key]?.maximum, right[key]?.maximum) &&
      close(left[key]?.midpoint, right[key]?.midpoint),
  );
}

export interface RecommendationSnapshot {
  status: string;
  target_ranges: unknown;
  warnings?: unknown;
  mandate_id?: string | null;
}
/**
 * Whether a new daily recommendation proposes nothing different from the one
 * the user already decided on: same status, mandate, ranges and warnings.
 */
export function isUnchangedRecommendation(
  decided: RecommendationSnapshot,
  latest: RecommendationSnapshot,
): boolean {
  const warnings = (value: unknown) =>
    JSON.stringify([...((value ?? []) as string[])].sort());
  return (
    decided.status === latest.status &&
    (decided.mandate_id ?? null) === (latest.mandate_id ?? null) &&
    warnings(decided.warnings) === warnings(latest.warnings) &&
    sameTargetRanges(decided.target_ranges, latest.target_ranges)
  );
}
