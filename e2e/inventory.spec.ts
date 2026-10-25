import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("inventario: provider, ambiente, applicazione e progetto", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  let provider = `Provider E2E ${suffix}`;
  const environment = `Ambiente E2E ${suffix}`;
  const application = `Applicazione E2E ${suffix}`;
  const project = `Progetto E2E ${suffix}`;

  await login(page);

  await page.goto("/providers");
  await page.getByRole("button", { name: "Nuovo provider" }).click();
  await page.getByLabel("Nome").fill(provider);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  await page
    .getByRole("row", { name: provider })
    .getByRole("button", { name: "Modifica" })
    .click();
  provider = `${provider} (mod)`;
  await page.getByLabel("Nome").fill(provider);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  await page.goto("/environments");
  await page.getByRole("button", { name: "Nuovo ambiente" }).click();
  await page.getByLabel("Nome").fill(environment);
  await page.getByLabel("Descrizione").fill("Ambiente creato dal test");
  await page.getByRole("button", { name: "Salva" }).click();
  await page
    .getByRole("row", { name: environment })
    .getByRole("link", { name: "Apri" })
    .click();
  await page.getByRole("button", { name: "Collega provider" }).click();
  await page
    .getByLabel("Provider", { exact: true })
    .selectOption({ label: provider });
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  await page.goto("/applications");
  await page.getByRole("button", { name: "Nuova applicazione" }).click();
  await page.getByLabel("Nome").fill(application);
  await page.getByLabel("Descrizione").fill("Applicazione creata dal test");
  await page.getByLabel("Base path").fill("/e2e");
  await page.getByLabel("Porta in ascolto").fill("8080");
  await page.getByRole("button", { name: "Salva" }).click();
  await page
    .getByRole("row", { name: application })
    .getByRole("link", { name: "Apri" })
    .click();
  await page.getByRole("button", { name: "Nuova versione" }).click();
  await page.getByLabel("Numero versione").fill("1.0.0");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: "1.0.0" })).toBeVisible();

  await page
    .getByRole("row", { name: "1.0.0" })
    .getByRole("button", { name: "Modifica" })
    .click();
  await page.getByLabel("Numero versione").fill("1.0.1");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: "1.0.1" })).toBeVisible();

  await page.getByRole("button", { name: "API della versione 1.0.1" }).click();
  await page.getByRole("button", { name: "Nuova API" }).click();
  await page.getByLabel("URL").fill("/health");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: "/health" })).toBeVisible();

  await page
    .getByRole("row", { name: "/health" })
    .getByRole("button", { name: "Modifica" })
    .click();
  await page.getByLabel("URL").fill("/healthz");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: "/healthz" })).toBeVisible();

  await page
    .getByRole("button", { name: "Query param di GET /healthz" })
    .click();
  await page.getByRole("button", { name: "Nuovo query param" }).click();
  await page.getByLabel("Nome").fill("verbose");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: "verbose" })).toBeVisible();

  await page
    .getByRole("row", { name: "verbose" })
    .getByRole("button", { name: "Modifica" })
    .click();
  await page.getByLabel("Nome").fill("debug");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: "debug" })).toBeVisible();

  await page.goto("/projects");
  await page.getByRole("button", { name: "Nuovo progetto" }).click();
  await page.getByLabel("Nome").fill(project);
  await page.getByRole("button", { name: "Salva" }).click();
  await page
    .getByRole("row", { name: project })
    .getByRole("link", { name: "Apri" })
    .click();
  await page.getByRole("button", { name: "Collega applicazione" }).click();
  await page
    .getByLabel("Applicazione", { exact: true })
    .selectOption({ label: application });
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("cell", { name: application })).toBeVisible();
});
