import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("remoto: credenziali, comandi e test di rete", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const credential = `Credenziale E2E ${suffix}`;
  const template = `Comando E2E ${suffix}`;
  const reachability = `Reach E2E ${suffix}`;

  page.on("dialog", (dialog) => void dialog.accept());
  await login(page);

  await page.goto("/credentials");
  await page.getByRole("button", { name: "Nuova credenziale" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(credential);
  await page.getByLabel("Utente SSH").fill("root");
  await page
    .getByLabel("Password o chiave privata (vuoto = invariato)")
    .fill("e2e-secret");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("row", { name: credential })).toBeVisible();
  await expect(
    page.getByRole("row", { name: credential }).getByText("impostato"),
  ).toBeVisible();
  await expect(page.getByText("e2e-secret")).toHaveCount(0);

  await page
    .getByRole("row", { name: credential })
    .getByRole("button", { name: "Elimina" })
    .click();
  await expect(page.getByRole("row", { name: credential })).toHaveCount(0);

  await page.goto("/commands");
  await page.getByRole("button", { name: "Nuovo comando" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(template);
  await page.getByLabel("Script").fill("echo {{ServerName}}");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("row", { name: template })).toBeVisible();
  await page
    .getByRole("row", { name: template })
    .getByRole("button", { name: "Elimina" })
    .click();

  await page.goto("/reachability");
  await page.getByRole("button", { name: "Nuovo test" }).click();
  await page.getByLabel("Host").fill("example.com");
  await page.getByLabel("Descrizione").fill(reachability);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(
    page.getByRole("cell", { name: "example.com" }).first(),
  ).toBeVisible();

  await page.goto("/executions");
  await expect(
    page.getByRole("heading", { name: "Registro esecuzioni" }),
  ).toBeVisible();
});
