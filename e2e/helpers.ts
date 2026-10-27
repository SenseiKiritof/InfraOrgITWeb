import { expect, type Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/realms\/infraorgit/);
  await page.fill("#username", "admin");
  await page.fill("#password", "dev-admin");
  await page.click("#kc-login");
  await expect(page.getByRole("heading", { name: "InfraOrgIT" })).toBeVisible();
}
