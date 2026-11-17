import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("mcp: la pagina agenti mostra stato e richieste", async ({ page }) => {
  await login(page);
  await page.goto("/approvals");

  await expect(page.getByRole("heading", { name: "MCP agents" })).toBeVisible();
  await expect(page.getByText("Agent approval")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Pending agents/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Permission requests/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Approved agents/ }),
  ).toBeVisible();
});
