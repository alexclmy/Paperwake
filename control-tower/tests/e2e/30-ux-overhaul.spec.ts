import { expect, test } from "@playwright/test";
import { createDashboard, signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("home shows the status strip and a gallery with one-click Show on panel", async ({ page }, info) => {
  const { id } = await createDashboard(page, `Home ${info.project.name}`);
  await page.goto("/overview");
  await expect(page.getByTestId("on-panel")).toBeVisible();
  await expect(page.getByTestId(`home-card-${id}`)).toBeVisible();
  await page.getByTestId(`home-show-${id}`).click();
  await expect(page.getByTestId("send-review")).toBeVisible();
  await page.getByTestId("send-cancel").click();
});

test("delete confirmation offers delete, archive instead, cancel — and deletes", async ({ page }, info) => {
  const { id } = await createDashboard(page, `Delete ${info.project.name}`);
  await page.getByTestId(`more-${id}`).click();
  await page.getByTestId(`delete-${id}`).click();
  const dialog = page.getByTestId("delete-confirm");
  await expect(dialog).toContainText("Delete permanently");
  await expect(dialog).toContainText("Archive instead");
  await page.getByTestId("delete-cancel").click();
  await expect(page.getByTestId(`dash-${id}`)).toBeVisible();

  await page.getByTestId(`more-${id}`).click();
  await page.getByTestId(`delete-${id}`).click();
  await page.getByTestId("delete-confirm-button").click();
  await expect(page.getByTestId("dashboard-grid").getByTestId(`dash-${id}`)).toHaveCount(0);
  expect((await page.request.get(`/api/dashboards/${id}`)).status()).toBe(404);
});

test("the selected composition cannot be deleted", async ({ page }, info) => {
  const { id } = await createDashboard(page, `Selected ${info.project.name}`);
  await page.getByTestId(`select-${id}`).click();
  await page.getByTestId("send-cancel").click();
  await page.getByTestId(`more-${id}`).click();
  await page.getByTestId(`delete-${id}`).click();
  await expect(page.getByTestId("delete-selected-note")).toBeVisible();
  await expect(page.getByTestId("delete-confirm-button")).toBeDisabled();
  await page.getByTestId("delete-cancel").click();
});
