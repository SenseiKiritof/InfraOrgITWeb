import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("admin: gruppi, ruoli, utenti e menu", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const group = `Gruppo E2E ${suffix}`;
  const role = `Ruolo E2E ${suffix}`;
  const user = `user.e2e.${suffix}`;
  const menu = `Menu E2E ${suffix}`;

  page.on("dialog", (dialog) => void dialog.accept());
  await login(page);

  await page.goto("/groups");
  await page.getByRole("button", { name: "Nuovo gruppo" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(group);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("row", { name: group })).toBeVisible();

  await page.goto("/roles");
  await page.getByRole("button", { name: "Nuovo ruolo" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(role);
  await page.getByLabel("Etichetta").fill(role);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("row", { name: role })).toBeVisible();

  await page.goto("/users");
  await page.getByRole("button", { name: "Nuovo utente" }).click();
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Nome", { exact: true }).fill("Utente");
  await page.getByLabel("Cognome").fill("E2E");
  await page.getByLabel(group).check();
  await page.getByLabel(role).check();
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("row", { name: user })).toBeVisible();
  await expect(
    page.getByRole("row", { name: user }).getByText(role),
  ).toBeVisible();

  await page.goto("/menu");
  await page.getByRole("button", { name: "Nuovo menu" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(menu);
  await page.getByLabel("Path").fill(`/menu-e2e-${suffix}`);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("row", { name: menu })).toBeVisible();
  await page
    .getByRole("row", { name: menu })
    .getByRole("button", { name: "Elimina" })
    .click();
  await expect(page.getByRole("row", { name: menu })).toHaveCount(0);

  await page.goto("/users");
  await page
    .getByRole("row", { name: user })
    .getByRole("button", { name: "Elimina" })
    .click();
  await expect(page.getByRole("row", { name: user })).toHaveCount(0);

  await page.goto("/roles");
  await page
    .getByRole("row", { name: role })
    .getByRole("button", { name: "Elimina" })
    .click();
  await expect(page.getByRole("row", { name: role })).toHaveCount(0);

  await page.goto("/groups");
  await page
    .getByRole("row", { name: group })
    .getByRole("button", { name: "Elimina" })
    .click();
  await expect(page.getByRole("row", { name: group })).toHaveCount(0);
});
