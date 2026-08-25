import { expect, test } from "@playwright/test";
const routes = [
  "/today",
  "/onboarding",
  "/allocation",
  "/portfolio",
  "/paper",
  "/reviews",
  "/workbench",
  "/validation/learning",
  "/governance",
  "/universe",
];
for (const route of routes)
  test(`${route} requires authentication`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
  });
