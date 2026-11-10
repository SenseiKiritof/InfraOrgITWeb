import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("MCP: token personale, tools/list e revoca", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);

  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const apiBase = base.includes(":3000")
    ? "http://localhost:5298"
    : base.replace(/\/$/, "");

  const name = `E2E MCP ${Date.now()}`;
  await page.goto("/tokens");
  await page.getByRole("button", { name: "Nuovo token" }).click();
  await page.getByLabel("Nome").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Token creato")).toBeVisible();
  const token =
    (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(token.startsWith("itk_")).toBe(true);

  const initialize = await page.request.post(`${apiBase}/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "e2e", version: "1" },
      },
    },
  });
  expect(initialize.status()).toBe(200);

  const tools = await page.request.post(`${apiBase}/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  expect(tools.status()).toBe(200);
  expect(await tools.text()).toContain("list_servers");

  const resources = await page.request.post(`${apiBase}/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: 4, method: "resources/list" },
  });
  expect(resources.status()).toBe(200);
  expect(await resources.text()).toContain("infraorgit://inventory/summary");

  const prompts = await page.request.post(`${apiBase}/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: 5, method: "prompts/list" },
  });
  expect(prompts.status()).toBe(200);
  expect(await prompts.text()).toContain("diagnose-server");

  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: "Revoca" }).click();
  await expect(row.getByRole("cell", { name: "Revocato" })).toBeVisible();

  const revoked = await page.request.post(`${apiBase}/mcp`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: 3, method: "tools/list" },
  });
  expect(revoked.status()).toBe(401);
});
