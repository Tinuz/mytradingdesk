import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read = (n: string) =>
  readFileSync(resolve(`supabase/migrations/${n}`), "utf8");
describe("capital allocation migrations", () => {
  const allocation = read("202608250026_allocation_domain.sql"),
    paper = read("202608250027_paper_validation_domain.sql"),
    cash = read("202608250028_cash_rate_contract.sql"),
    source = read("202608250031_source_gate_contract_fix.sql"),
    completion = read("202608250030_capital_allocation_completion.sql"),
    expansion = read("202608250032_l1_relative_framework.sql");
  it("persists immutable versioned recommendations", () => {
    expect(allocation).toContain("allocation_recommendations");
    expect(allocation).toContain("allocation_recommendations_immutable");
    expect(allocation).toContain("analyst_signoffs");
  });
  it("freezes the prospective protocol and benchmark domain", () => {
    expect(paper).toContain("allocation_protocols");
    expect(paper).toContain("paper_nav");
    expect(paper).toContain("minimumProspectiveMonths");
  });
  it("uses an official cash-rate contract", () =>
    expect(cash).toContain("DGS3MO"));
  it("fails allocation closed on source rights and freshness", () => {
    expect(source).toContain("allocation_approved");
    expect(source).toContain("historical_storage_rights");
    expect(source).toContain("make_interval");
  });
  it("covers reconciliation, fundamentals, attribution and read-only connectors", () => {
    for (const table of [
      "portfolio_reconciliations",
      "portfolio_lot_matches",
      "fundamental_snapshots",
      "performance_analytics",
      "read_only_connectors",
    ])
      expect(completion).toContain(table);
    expect(completion).toContain("prevent_observation_mutation");
    expect(completion).toContain('"trade":false');
  });
  it("separates evidence, data confidence and conviction", () => {
    expect(expansion).toContain("analyst_conviction");
    expect(expansion).toContain("data_confidence");
    expect(expansion).toContain("model_evidence_status");
  });
});
