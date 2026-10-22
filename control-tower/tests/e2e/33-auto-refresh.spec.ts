import { expect, test } from "@playwright/test";
import { createDistinctDashboard, csrfFrom, signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

async function select(page: import("@playwright/test").Page, id: string, interval: number | null) {
  const res = await page.request.patch(`/api/dashboards/${id}`, {
    headers: { "content-type": "application/json", "x-csrf-token": await csrfFrom(page) },
    data: { selected: true, refreshIntervalMinutes: interval },
  });
  expect(res.status(), await res.text()).toBe(200);
}

test("warning banner on Home explains a disabled auto-refresh and fixes it in one click", async ({ page }, info) => {
  const { id, title } = await createDistinctDashboard(page, `AutoOff ${info.project.name}`);
  await select(page, id, null);

  await page.goto("/overview");
  const card = page.getByTestId("auto-refresh-chip");
  await expect(page.getByTestId("push-picker")).toHaveValue(id);
  void title;
  await expect(card.getByTestId("auto-refresh-summary")).toHaveText("Auto · off");
  const warning = page.getByTestId("auto-refresh-warning");
  await expect(warning).toHaveAttribute("data-code", "no_interval");
  await expect(warning).toContainText("Auto-refresh is off");

  await page.getByTestId("auto-refresh-warning-fix").click();
  await expect(page.getByTestId("auto-refresh-warning")).toHaveCount(0);
  await expect(card.getByTestId("auto-refresh-summary")).toHaveText("Auto · 60 min");
  await expect(page.getByTestId(`auto-badge-${id}`)).toHaveText("Auto · 60 min");

  // The chip opens a small popover; the interval changes in one click there.
  await card.click();
  await expect(page.getByTestId("auto-refresh-popover")).toBeVisible();
  await page.getByTestId("auto-refresh-30").click();
  await expect(card.getByTestId("auto-refresh-summary")).toHaveText("Auto · 30 min");
  const record = await (await page.request.get(`/api/dashboards/${id}`)).json();
  expect(record.record.doc.refreshIntervalMinutes).toBe(30);
});

test("the editor of the auto-refresh composition shows the same banner and fix", async ({ page }, info) => {
  const { id } = await createDistinctDashboard(page, `AutoEdit ${info.project.name}`);
  await select(page, id, null);
  await page.goto(`/dashboards/${id}/edit`);
  await expect(page.getByTestId("editor-auto-refresh-warning")).toBeVisible();
  await page.getByTestId("editor-auto-refresh-warning-fix").click();
  await expect(page.getByTestId("editor-auto-refresh-warning")).toHaveCount(0);
  await expect(page.getByTestId("refresh-interval")).toHaveValue("60");
});

test("after a successful send the toast offers 'Keep it up to date'", async ({ page }, info) => {
  const { id } = await createDistinctDashboard(page, `Keep ${info.project.name}`);
  await page.goto("/overview");
  await page.getByTestId(`home-show-${id}`).click();
  await expect(page.getByTestId("send-review")).toBeVisible();
  await page.getByTestId("send-confirm").click();
  await expect(page.getByTestId("send-done")).toBeVisible({ timeout: 45_000 });

  await page.getByTestId("keep-up-to-date").click();
  await expect(page.getByTestId("keep-up-to-date-already")).toContainText("every 60 min");
  const record = await (await page.request.get(`/api/dashboards/${id}`)).json();
  expect(record.record.doc.refreshIntervalMinutes).toBe(60);
  const state = await (await page.request.get("/api/state")).json();
  expect(state.selectedDashboardId).toBe(id);
});
