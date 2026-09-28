import { describe, expect, it } from "vitest";
import { returnAxis } from "../../apps/web/app/paper/axis";
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
  it("labels every tick exactly, whatever the plotted range", () => {
    // Deterministic pseudo-random ranges from 0.05 to 200 percentage points.
    let seed = 42;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5000; i++) {
      const span = 0.05 * 4000 ** random();
      const low = -span * random();
      const values = [low, low + span * random(), low + span];
      const { ticks, domain, digits } = returnAxis(values);
      expect(domain[0]).toBeLessThanOrEqual(Math.min(0, ...values) + 1e-9);
      expect(domain[1]).toBeGreaterThanOrEqual(Math.max(0, ...values) - 1e-9);
      expect(ticks).toContain(0);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(7);
      const steps = ticks.slice(1).map((tick, j) => tick - ticks[j]!);
      for (const tick of ticks)
        // The label at `digits` decimals is the tick itself.
        expect(Number(tick.toFixed(digits))).toBeCloseTo(tick, 9);
      for (const stepSize of steps) expect(stepSize).toBeCloseTo(steps[0]!, 9);
    }
  });
  it("chooses 1/2/5 steps with matching decimals", () => {
    expect(returnAxis([-0.15, 0.45])).toEqual({
      ticks: [-0.2, 0, 0.2, 0.4, 0.6],
      domain: [-0.2, 0.6],
      digits: 1,
    });
    expect(returnAxis([-2.2, 0.7]).digits).toBe(0);
    expect(returnAxis([0.01, 0.03]).digits).toBe(2);
  });
});
