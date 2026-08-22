import { expect, test } from "@playwright/test";

test("login screen validates credentials without exposing secrets", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
  await page.getByLabel("E-mailadres").fill("invalid");
  await page.getByLabel("Wachtwoord").fill("short");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: "geldig e-mailadres" })).toBeVisible();
});

test("login screen reaches configured Supabase authentication", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill("not-a-real-user@example.com");
  await page.getByLabel("Wachtwoord").fill("not-a-real-password");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("Inloggen is mislukt. Controleer je gegevens.", { timeout: 15_000 });
});
