import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("diagramma: crea, salva layout e riapre", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const provider = `Diagramma Provider ${suffix}`;
  const diagram = `Diagramma E2E ${suffix}`;

  await login(page);

  await page.goto("/providers");
  await page.getByRole("button", { name: "Nuovo provider" }).click();
  await page.getByLabel("Nome").fill(provider);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  await page.goto("/diagrams");
  await page.getByRole("button", { name: "Nuovo diagramma" }).click();
  await page.getByLabel("Nome").fill(diagram);
  await page.getByRole("button", { name: "Salva" }).click();

  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.getByText(provider)).toBeVisible();

  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByText("Layout salvato.")).toBeVisible();

  await page.reload();
  await expect(page.getByText(provider)).toBeVisible();

  await page.getByRole("link", { name: "Elenco" }).click();
  const row = page.getByRole("row", { name: diagram });
  await expect(row).toBeVisible();

  page.on("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Elimina" }).click();
  await expect(page.getByRole("row", { name: diagram })).toHaveCount(0);
});
