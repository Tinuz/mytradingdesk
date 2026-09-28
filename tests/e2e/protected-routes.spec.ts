import { expect, test } from "@playwright/test";
const routes = [
  "/today",
  "/onboarding",
  "/allocation",
  "/portfolio",
  "/paper",
  "/reviews",
  "/workbench",
  "/validation",
  "/validation/learning",
  "/governance",
  "/universe",
  "/dashboard",
  "/assets/btc",
  "/indicators/stablecoins",
  "/research",
  "/history",
  "/journal",
  "/mandate",
  "/notifications",
];
for (const route of routes)
  test(`${route} requires authentication`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
  });
