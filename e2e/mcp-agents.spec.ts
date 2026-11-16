import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("mcp: la pagina agenti mostra stato e richieste", async ({ page }) => {
  await login(page);
  await page.goto("/approvals");

  await expect(page.getByRole("heading", { name: "Agenti MCP" })).toBeVisible();
  await expect(page.getByText("Approvazione dell'agente")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Agenti in attesa/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Richieste di permesso/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Agenti approvati/ }),
  ).toBeVisible();
});
