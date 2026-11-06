import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("ricerca globale: mostra il tipo e apre il dettaglio", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const provider = `Ricerca E2E ${suffix}`;

  await login(page);

  await page.goto("/providers");
  await page.getByRole("button", { name: "Nuovo provider" }).click();
  await page.getByLabel("Nome").fill(provider);
  await page.getByRole("dialog").getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  const search = page.getByRole("combobox", { name: "Cerca" });
  await search.fill(provider);
  const option = page.getByRole("option", { name: new RegExp(provider) });
  await expect(option).toBeVisible();
  await expect(option).toContainText("Provider");
  await option.click();
  await expect(page).toHaveURL(/\/providers\/\d+$/);

  await page.goto("/providers");
  await page.getByRole("textbox", { name: "Cerca" }).fill(provider);
  await page.getByRole("button", { name: "Cerca" }).click();
  page.on("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("row", { name: provider })
    .getByRole("button", { name: "Elimina" })
    .click();
  await expect(page.getByRole("row", { name: provider })).toHaveCount(0);
});
