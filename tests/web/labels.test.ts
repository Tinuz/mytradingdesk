import { describe, expect, it } from "vitest";
import { axisDigits } from "../../apps/web/app/paper/axis";
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
    expect(label("SOURCE_NOT_APPROVED")).toBe("Bron niet goedgekeurd");
  });
});

describe("results chart axis", () => {
  it("uses enough decimals for the plotted range", () => {
    expect(axisDigits([-0.15, 0.45])).toBe(2);
    expect(axisDigits([-3, 4])).toBe(1);
    expect(axisDigits([-20, 35])).toBe(0);
    expect(axisDigits([])).toBe(1);
  });
});
