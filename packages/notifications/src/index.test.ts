import { describe, expect, it } from "vitest";
import {
  dataQualityAlert,
  decisionAlert,
  selectAlerts,
  type DecisionAlertInput,
} from ".";
const transition: DecisionAlertInput = {
  eventId: "snapshot-2",
  decisionSnapshotId: "snapshot-2",
  assetId: "btc-id",
  assetSymbol: "BTC",
  occurredAt: "2026-08-22T12:00:00Z",
  previousDecision: "NEUTRAL",
  decision: "RISK_REDUCTION",
  previousMacroScore: 0,
  macroScore: -1,
  previousCryptoScore: 1,
  cryptoScore: 0,
  previousMarketStructure: "HEALTHY",
  marketStructure: "STRESSED",
  previousAssetScore: 1,
  assetScore: 0,
  previousRiskOverride: "NONE",
  riskOverride: "NONE",
};
describe("alert engine", () => {
  it("deduplicates the same event ten times", () => {
    const candidate = decisionAlert(transition, "LIVE")!;
    const result = selectAlerts(
      Array.from({ length: 10 }, () => candidate),
      [],
      new Date("2026-08-22T12:01:00Z"),
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.suppressed).toHaveLength(9);
    expect(result.suppressed.every((item) => item.reason === "DUPLICATE")).toBe(
      true,
    );
  });
  it("never alerts during historical backfill", () => {
    expect(decisionAlert(transition, "HISTORICAL")).toBeNull();
    expect(
      dataQualityAlert(
        {
          eventId: "dq-1",
          indicatorCode: "BTC_PRICE_USD",
          occurredAt: transition.occurredAt,
          eventType: "STALE_DATA",
          severity: "WARNING",
        },
        "HISTORICAL",
      ),
    ).toBeNull();
  });
  it("emits one new material deterioration", () => {
    const result = selectAlerts(
      [decisionAlert(transition, "LIVE")!],
      [],
      new Date("2026-08-22T12:01:00Z"),
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({
      alertType: "DECISION_CHANGE",
      direction: "DETERIORATING",
      severity: "WARNING",
    });
  });
  it("applies cooldown to different events of the same kind", () => {
    const first = decisionAlert(transition, "LIVE")!;
    const next = decisionAlert(
      {
        ...transition,
        eventId: "snapshot-3",
        decisionSnapshotId: "snapshot-3",
      },
      "LIVE",
    )!;
    const result = selectAlerts(
      [next],
      [
        {
          fingerprint: first.fingerprint,
          alertType: first.alertType,
          assetId: first.assetId,
          createdAt: "2026-08-22T11:00:00Z",
        },
      ],
      new Date("2026-08-22T12:00:00Z"),
      24,
    );
    expect(result.accepted).toHaveLength(0);
    expect(result.suppressed[0]?.reason).toBe("COOLDOWN");
  });
  it("classifies extreme market risk as critical", () => {
    const candidate = decisionAlert(
      {
        ...transition,
        previousDecision: "NEUTRAL",
        decision: "NEUTRAL",
        previousMacroScore: 0,
        macroScore: 0,
        previousCryptoScore: 1,
        cryptoScore: 1,
        previousMarketStructure: "HEALTHY",
        marketStructure: "OVERHEATED",
        previousAssetScore: 1,
        assetScore: 1,
        riskOverride: "OVERHEAT_CAP",
      },
      "LIVE",
    );
    expect(candidate).toMatchObject({
      alertType: "MARKET_STRUCTURE_RISK",
      severity: "CRITICAL",
      direction: "DETERIORATING",
    });
  });
  it("does not re-alert while the same risk override persists", () => {
    const persisting = {
      ...transition,
      previousDecision: "ACCUMULATION",
      decision: "ACCUMULATION",
      previousMacroScore: 1,
      macroScore: 1,
      previousCryptoScore: 1,
      cryptoScore: 1,
      previousMarketStructure: "OVERHEATED",
      marketStructure: "OVERHEATED",
      previousAssetScore: 1,
      assetScore: 1,
      previousRiskOverride: "OVERHEAT_CAP",
      riskOverride: "OVERHEAT_CAP",
    };
    expect(decisionAlert(persisting, "LIVE")).toBeNull();
    // Another material change while the override persists is not critical.
    expect(
      decisionAlert({ ...persisting, assetScore: 0 }, "LIVE"),
    ).toMatchObject({ alertType: "REGIME_CHANGE", severity: "INFO" });
  });
  it("treats a move between the two extreme structures as critical", () => {
    const base = {
      ...transition,
      previousDecision: "NEUTRAL",
      decision: "NEUTRAL",
      previousMacroScore: 0,
      macroScore: 0,
      previousCryptoScore: 0,
      cryptoScore: 0,
      previousAssetScore: 0,
      assetScore: 0,
    };
    expect(
      decisionAlert(
        {
          ...base,
          previousMarketStructure: "OVERHEATED",
          marketStructure: "CAPITULATION",
        },
        "LIVE",
      ),
    ).toMatchObject({
      alertType: "MARKET_STRUCTURE_RISK",
      severity: "CRITICAL",
    });
  });
  it("alerts on an escalated override but not on a de-escalation", () => {
    const base = {
      ...transition,
      previousDecision: "NEUTRAL",
      decision: "NEUTRAL",
      previousMacroScore: 1,
      macroScore: 1,
      previousCryptoScore: 1,
      cryptoScore: 1,
      previousAssetScore: 0,
      assetScore: 0,
      previousMarketStructure: "STRESSED",
      marketStructure: "STRESSED",
    };
    expect(
      decisionAlert(
        {
          ...base,
          previousRiskOverride: "STRESS_CAP",
          riskOverride: "CAPITULATION_CAP",
        },
        "LIVE",
      ),
    ).toMatchObject({ severity: "CRITICAL" });
    expect(
      decisionAlert(
        {
          ...base,
          previousRiskOverride: "CAPITULATION_CAP",
          riskOverride: "STRESS_CAP",
        },
        "LIVE",
      ),
    ).toBeNull();
  });
  it("keeps a decision change during an extreme structure critical", () => {
    expect(
      decisionAlert(
        {
          ...transition,
          previousMarketStructure: "CAPITULATION",
          marketStructure: "CAPITULATION",
          previousRiskOverride: "CAPITULATION_CAP",
          riskOverride: "CAPITULATION_CAP",
        },
        "LIVE",
      ),
    ).toMatchObject({ alertType: "DECISION_CHANGE", severity: "CRITICAL" });
  });
});
