import { expect, test } from "@playwright/test";
import { createDashboard, csrfFrom, signIn } from "./helpers";

/**
 * Panel language: one tower-wide setting, a mutating route like the others,
 * and every preview follows it at once.
 */
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.afterEach(async ({ page }) => {
  const csrf = await csrfFrom(page);
  await page.request.patch("/api/state", {
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    data: { panelLang: "fr" },
  });
});

test("the setting is CSRF-guarded and persisted", async ({ page }) => {
  await page.goto("/device");
  const refused = await page.request.patch("/api/state", {
    headers: { "content-type": "application/json" },
    data: { panelLang: "en" },
  });
  expect(refused.status()).toBe(403);
  const bad = await page.request.patch("/api/state", {
    headers: { "content-type": "application/json", "x-csrf-token": await csrfFrom(page) },
    data: { panelLang: "de" },
  });
  expect(bad.status()).toBe(400);
  const state = await (await page.request.get("/api/state")).json();
  expect(state.panelLang).toBe("fr");
});

test("switching language re-renders the editor preview and survives reload", async ({ page }) => {
  const { id } = await createDashboard(page, "Lang");
  await page.goto("/device");
  await expect(page.getByTestId("panel-lang-fr")).toHaveAttribute("aria-pressed", "true");

  await page.goto(`/dashboards/${id}/edit`);
  const canvas = page.getByTestId("designer-preview");
  await expect(canvas).toBeVisible();
  const before = await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.getByTestId("editor-panel-lang-en").click();
  await expect(page.getByTestId("editor-panel-lang-en")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL()))
    .not.toBe(before);

  await page.goto("/device");
  await expect(page.getByTestId("panel-lang-en")).toHaveAttribute("aria-pressed", "true");
  const state = await (await page.request.get("/api/state")).json();
  expect(state.panelLang).toBe("en");

  await page.getByTestId("panel-lang-fr").click();
  await expect(page.getByTestId("panel-lang-fr")).toHaveAttribute("aria-pressed", "true");
});
