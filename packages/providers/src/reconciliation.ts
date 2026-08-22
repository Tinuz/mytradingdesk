import type { DataContract, ReconciliationResult, StoredRawObservation } from "./types";

export function reconcile(canonical: StoredRawObservation, comparison: StoredRawObservation | undefined, contract: DataContract): ReconciliationResult {
  if (!comparison) return { status: "NOT_COMPARED" };
  const denominator = Math.abs(canonical.value) || 1;
  const differencePercent = Math.abs(canonical.value - comparison.value) / denominator * 100;
  return {
    status: differencePercent <= contract.reconciliationTolerancePercent ? "MATCH" : "DISCREPANCY",
    differencePercent,
    comparedProvider: comparison.provider
  };
}
