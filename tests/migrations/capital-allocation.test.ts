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
    expansion = read("202608250032_l1_relative_framework.sql"),
    experience = read("202608250033_product_experience_validation.sql"),
    onboarding = read("202608250034_onboarding_hardening.sql"),
    onboardingRls = read("202608250035_onboarding_paper_portfolio_rls.sql");
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
  it("adds an immutable prospective learning layer", () => {
    expect(experience).toContain("recommendation_outcomes");
    expect(experience).toContain("monthly_validation_reports");
    expect(experience).toContain("recommendation_outcomes_immutable");
    expect(experience).toContain("connector_sync_runs");
  });
  it("creates onboarding state atomically with hard mandate boundaries", () => {
    expect(onboarding).toContain("complete_guided_onboarding");
    expect(onboarding).toContain(
      "p_starting_capital not between 1000 and 100000000",
    );
    expect(onboarding).toContain("p_min_cash not between 0 and 99");
    expect(onboarding).toContain("p_assets <@");
    expect(onboardingRls).toContain("for insert");
    expect(onboardingRls).toContain("auth.uid()) = user_id");
  });
});
