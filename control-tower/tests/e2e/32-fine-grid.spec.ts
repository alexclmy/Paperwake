import { expect, test, type Page } from "@playwright/test";
import { cellPosition, createEmptyDashboard, signIn } from "./helpers";

/**
 * The 16x12 grid: blocks shrink to fit instead of being refused, a full
 * panel says so inline, and Auto layout re-packs and can be undone.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

async function add(page: Page, type: string): Promise<void> {
  await page.getByTestId(`add-${type}`).click();
}

test("a block that does not fit at its default size is shrunk, not refused", async ({ page }, info) => {
  const { id } = await createEmptyDashboard(page, `Fine shrink ${info.project.name}`);
  await page.goto(`/dashboards/${id}/edit`);

  // weatherHero (16x8) then weather24h (16x6): only 4 rows are left, so the
  // second one lands shrunk instead of failing.
  await add(page, "weatherHero");
  await add(page, "weather24h");
  await expect(page.getByTestId("module-weather24h")).toBeVisible();
  const pos = await cellPosition(page, "module-weather24h");
  expect(pos).toMatchObject({ y: 8, h: 4 });
  await expect(page.getByTestId("no-room")).toHaveCount(0);
  await expect(page.getByTestId("layout-problems")).toHaveCount(0);
});

test("a full panel says 'No room left' inline, and nothing is placed", async ({ page }, info) => {
  const { id } = await createEmptyDashboard(page, `Fine full ${info.project.name}`);
  await page.goto(`/dashboards/${id}/edit`);
  await add(page, "image");
  const image = page.getByTestId("module-image");
  await image.focus();
  // Grow the image to the whole panel from the keyboard.
  for (let i = 0; i < 12; i += 1) await page.keyboard.press("Shift+ArrowRight");
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("Shift+ArrowDown");
  expect(await cellPosition(page, "module-image")).toMatchObject({ w: 16, h: 12 });

  await add(page, "message");
  await expect(page.getByTestId("no-room")).toContainText("No room left: shrink or remove a block");
  await expect(page.getByTestId("module-message")).toHaveCount(0);
});

test("Auto layout re-packs blocks in rows and can be undone", async ({ page }, info) => {
  const { id } = await createEmptyDashboard(page, `Fine auto ${info.project.name}`);
  await page.goto(`/dashboards/${id}/edit`);
  await add(page, "timestamp");
  await add(page, "message");
  const before = await cellPosition(page, "module-message");

  await page.getByTestId("auto-layout").click();
  await expect(page.getByTestId("undo-auto-layout")).toBeVisible();
  const ts = await cellPosition(page, "module-timestamp");
  expect(ts).toMatchObject({ x: 0, y: 0 });
  await expect(page.getByTestId("layout-problems")).toHaveCount(0);

  await page.getByTestId("undo-auto-layout").click();
  expect(await cellPosition(page, "module-message")).toEqual(before);
  await expect(page.getByTestId("auto-layout")).toBeVisible();
});

test("the inspector states the size in cells, and Duplicate finds room", async ({ page }, info) => {
  const { id } = await createEmptyDashboard(page, `Fine dup ${info.project.name}`);
  await page.goto(`/dashboards/${id}/edit`);
  await add(page, "haSensor");
  if (info.project.name === "desktop-chromium") {
    await expect(page.getByTestId("inspector-size")).toHaveText("6 × 2 cells");
    await page.getByTestId("duplicate-module").click();
  } else {
    await page.getByTestId("module-haSensor").focus();
    await page.keyboard.press("Control+d");
  }
  await expect(page.getByTestId("module-haSensor")).toHaveCount(2);
});
