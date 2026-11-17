import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("diagramma: crea, salva layout e riapre", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const provider = `Diagramma Provider ${suffix}`;
  const diagram = `Diagramma E2E ${suffix}`;

  await login(page);

  await page.goto("/providers");
  await page.getByRole("button", { name: "New provider" }).click();
  await page.getByLabel("Name", { exact: true }).fill(provider);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("textbox", { name: "Search" }).fill(provider);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  await page.goto("/diagrams");
  await page.getByRole("button", { name: "New diagram" }).click();
  await page.getByLabel("Name", { exact: true }).fill(diagram);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.getByText(provider)).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Layout saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByText(provider)).toBeVisible();

  await page.getByRole("link", { name: "List" }).click();
  const row = page.getByRole("row", { name: diagram });
  await expect(row).toBeVisible();

  page.on("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row", { name: diagram })).toHaveCount(0);

  await page.goto("/providers");
  await page.getByRole("textbox", { name: "Search" }).fill(provider);
  await page.getByRole("button", { name: "Search" }).click();
  await page
    .getByRole("row", { name: provider })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("row", { name: provider })).toHaveCount(0);
});
