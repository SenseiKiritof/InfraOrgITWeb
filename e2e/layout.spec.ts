import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("layout mobile: drawer e nessun overflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const nav = page.getByRole("navigation", { name: "Menu principale" });
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Apri menu" }).click();
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Servers" }).click();
  await expect(nav).toBeHidden();

  for (const path of ["/", "/servers", "/servers/114", "/projects/11"]) {
    await page.goto(path);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main ? main.scrollWidth - main.clientWidth : 0;
    });
    expect(overflow).toBe(0);
  }
});
