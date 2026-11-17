import { expect, test } from "@playwright/test";

test("login BFF, menu e logout", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/realms\/infraorgit/);

  await page.fill("#username", "admin");
  await page.fill("#password", "dev-admin");
  await page.click("#kc-login");

  await expect(page.getByRole("heading", { name: "InfraOrgIT" })).toBeVisible();
  await expect(page.getByText("Dev Admin", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Main menu" })
      .getByRole("link", { name: "Users" }),
  ).toBeVisible();

  const themeButton = page.getByRole("button", { name: /Theme:/ });
  for (let attempt = 0; attempt < 3; attempt++) {
    const classes = (await page.locator("html").getAttribute("class")) ?? "";
    if (classes.includes("dark")) break;
    await themeButton.click();
  }
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByText("Dev Admin", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.locator("summary").click();
  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL(/\/realms\/infraorgit/);
});
