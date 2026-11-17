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
  await page.getByRole("button", { name: "New credential" }).click();
  await page.getByLabel("Name", { exact: true }).fill(credential);
  await page.getByLabel("SSH user").fill("root");
  await page
    .getByLabel("Password or private key (empty = unchanged)")
    .fill("e2e-secret");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("row", { name: credential })).toBeVisible();
  await expect(
    page.getByRole("row", { name: credential }).getByText("set"),
  ).toBeVisible();
  await expect(page.getByText("e2e-secret")).toHaveCount(0);

  await page
    .getByRole("row", { name: credential })
    .getByRole("button", { name: "Server" })
    .click();
  const manager = page.getByRole("dialog", {
    name: "Manage credential servers",
  });
  await expect(manager).toBeVisible();
  await expect(manager.getByText("Assigned (0)")).toBeVisible();
  await manager.getByRole("button", { name: "Close" }).click();

  await page
    .getByRole("row", { name: credential })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("row", { name: credential })).toHaveCount(0);

  await page.goto("/commands");
  await page.getByRole("button", { name: "New command" }).click();
  await page.getByLabel("Name", { exact: true }).fill(template);
  await page.getByLabel("Script", { exact: true }).fill("echo {{ServerName}}");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("row", { name: template })).toBeVisible();
  await page
    .getByRole("row", { name: template })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("row", { name: template })).toHaveCount(0);

  await page.goto("/reachability");
  await page.getByRole("button", { name: "New test" }).click();
  await page.getByLabel("Host").fill("example.com");
  await page.getByLabel("Description", { exact: true }).fill(reachability);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("cell", { name: "example.com" }).first(),
  ).toBeVisible();

  await page.goto("/executions");
  await expect(
    page.getByRole("heading", { name: "Execution log" }),
  ).toBeVisible();

  await page.goto("/reachability");
  const reachRow = page.getByRole("row", { name: reachability });
  await reachRow.getByRole("button", { name: "Delete" }).click();
  await expect(reachRow).toBeHidden();
});
