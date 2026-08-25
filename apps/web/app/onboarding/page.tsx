import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { completeGuidedOnboarding, productExperience } from "../../lib/data";
import { Shell } from "../ui/shell";
import { OnboardingWizard } from "./wizard";
export default async function OnboardingPage() {
  const settings = await productExperience();
  if (settings?.onboarding_completed_at) redirect("/today");
  async function finish(f: FormData) {
    "use server";
    if (f.get("disclaimer") !== "on")
      throw new Error("Bevestiging is verplicht");
    await completeGuidedOnboarding({
      experience: String(f.get("experience")),
      baseCurrency: String(f.get("base_currency")),
      objective: String(f.get("objective")),
      horizon: Number(f.get("horizon")),
      maxDrawdown: Number(f.get("max_drawdown")),
      minCash: Number(f.get("min_cash")),
      maxAsset: Number(f.get("max_asset")),
      turnover: Number(f.get("turnover")),
      cadence: String(f.get("cadence")),
      assets: f.getAll("assets").map(String),
      startingCapital: Number(f.get("starting_capital")),
    });
    (await cookies()).set("cmi-view-mode", String(f.get("experience")), {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 31536000,
    });
    redirect("/today");
  }
  return (
    <Shell current="onboarding">
      <OnboardingWizard action={finish} />
    </Shell>
  );
}
