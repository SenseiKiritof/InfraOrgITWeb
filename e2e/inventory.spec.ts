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
  await page.getByRole("button", { name: "New provider" }).click();
  await page.getByLabel("Name", { exact: true }).fill(provider);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page.getByRole("textbox", { name: "Search" }).fill(provider);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  await page
    .getByRole("row", { name: provider })
    .getByRole("button", { name: "Edit" })
    .click();
  provider = `${provider} (mod)`;
  await page.getByLabel("Name", { exact: true }).fill(provider);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page.getByRole("textbox", { name: "Search" }).fill(provider);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  await page.goto("/environments");
  await page.getByRole("button", { name: "New environment" }).click();
  await page.getByLabel("Name", { exact: true }).fill(environment);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Ambiente creato dal test");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page.getByRole("textbox", { name: "Search" }).fill(environment);
  await page.getByRole("button", { name: "Search" }).click();
  await page
    .getByRole("row", { name: environment })
    .getByRole("link", { name: "Open" })
    .click();
  await page.getByRole("button", { name: "Link provider" }).click();
  await page.getByLabel("Provider", { exact: true }).fill(provider);
  await page.getByRole("option", { name: provider, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: provider })).toBeVisible();

  await page.goto("/applications");
  await page.getByRole("button", { name: "New application" }).click();
  await page.getByLabel("Name", { exact: true }).fill(application);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Applicazione creata dal test");
  await page.getByLabel("Base path").fill("/e2e");
  await page.getByLabel("Listening port").fill("8080");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page.getByRole("textbox", { name: "Search" }).fill(application);
  await page.getByRole("button", { name: "Search" }).click();
  await page
    .getByRole("row", { name: application })
    .getByRole("link", { name: "Open" })
    .click();
  await page.getByRole("button", { name: "New version" }).click();
  await page.getByLabel("Version number").fill("1.0.0");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "1.0.0" })).toBeVisible();

  await page
    .getByRole("row", { name: "1.0.0" })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByLabel("Version number").fill("1.0.1");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "1.0.1" })).toBeVisible();

  await page.getByRole("button", { name: "APIs of version 1.0.1" }).click();
  await page.getByRole("button", { name: "New API", exact: true }).click();
  await page.getByLabel("URL").fill("/health");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "/health" })).toBeVisible();

  await page
    .getByRole("row", { name: "/health" })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByLabel("URL").fill("/healthz");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "/healthz" })).toBeVisible();

  await page
    .getByRole("button", { name: "Query params of GET /healthz" })
    .click();
  await page.getByRole("button", { name: "New query param" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("verbose");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "verbose" })).toBeVisible();

  await page
    .getByRole("row", { name: "verbose" })
    .getByRole("button", { name: "Edit" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("debug");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "debug" })).toBeVisible();

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(project);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("row", { name: project })
    .getByRole("link", { name: "Open" })
    .click();
  await page.getByRole("button", { name: "Link application" }).click();
  await page.getByLabel("Application", { exact: true }).fill(application);
  await page.getByRole("option", { name: application, exact: true }).click();
  await page
    .getByRole("dialog", { name: "Link application" })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByRole("cell", { name: application })).toBeVisible();
});
