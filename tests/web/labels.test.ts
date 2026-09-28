import { describe, expect, it } from "vitest";
import { label, warningLabel } from "../../apps/web/app/ui/labels";

describe("display labels", () => {
  it("translates stored codes regardless of case", () => {
    expect(label("AVAILABLE")).toBe("Beslissing beschikbaar");
    expect(label("balanced")).toBe("Gebalanceerd");
    expect(label(null)).toBe("—");
  });
  it("falls back to readable text for unknown codes", () => {
    expect(label("SOME_NEW_STATE")).toBe("some new state");
  });
  it("translates compound warnings and keeps their subject", () => {
    expect(warningLabel("SOURCE_GATE:BTC_USD")).toBe(
      "Bron niet goedgekeurd: BTC_USD",
    );
    expect(warningLabel("BTC:FREEZE_ACTIVE")).toBe("BTC: blokkade actief");
    expect(warningLabel("TOTAL_RISK_CAP")).toBe("Totaal risicomaximum bereikt");
  });
});
