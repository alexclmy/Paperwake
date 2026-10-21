/**
 * The showcase panels in docs/images/showcase/, made reproducibly.
 *
 *     npm run showcase            (also run by `npm run screenshots:all`)
 *
 * Hand-made compositions on the 16x12 grid, rendered by the real panel
 * renderer (`renderDashboard`) over a fixed, fictional set of sources: a
 * "Lisbon" forecast, an invented agenda, invented sensors, a fixed instant.
 * Nothing on these pictures is a fact about anybody's home, and a re-run is
 * byte-identical.
 *
 * Output per composition: `<key>.png` (400x300, the panel's own pixels) and
 * `<key>@2x.png` (nearest-neighbour 800x600), plus `hero.png`: six panels in
 * an illustrated device frame drawn in CSS (no photograph), composed and
 * captured by headless Chromium.
 */

import fs from "node:fs";
import path from "node:path";
import { renderDashboard } from "@/core/render";
import type { RenderContext } from "@/core/render/types";
import { emptyDashboard, newModuleId, type DashboardDoc, type ModuleInstance } from "@/core/model";
import { MODULES } from "@/core/render/modules";
import { librarySource } from "@/core/library/source";
import type { LibraryArt } from "@/core/library/catalog";
import * as mascot from "@/core/library/art/mascot";
import * as balloon from "@/core/library/art/balloon";
import * as dnd from "@/core/library/art/dnd";
import * as coffee from "@/core/library/art/coffee";
import * as mountains from "@/core/library/art/mountains";
import { framePng } from "@/server/png";

import { SHOWCASE_NOW, SHOWCASE_SOURCES, SHOWCASE_TZ } from "@/server/sources/showcaseFixtures";

export { SHOWCASE_NOW, SHOWCASE_SOURCES, SHOWCASE_TZ };

function place(type: string, x: number, y: number, w: number, h: number, options: object = {}): ModuleInstance {
  return {
    id: newModuleId(),
    type,
    x,
    y,
    w,
    h,
    hidden: false,
    options: { ...(MODULES[type]?.defaultOptions as object), ...options },
  };
}

const t = (text: string, style: object = {}) => ({ text, visible: true, style });
const rule = (m: ModuleInstance, edges: Array<"top" | "bottom" | "left" | "right">, weight = 2): ModuleInstance => ({
  ...m,
  frame: { edges, weight, style: "solid", inset: 0, color: 0 },
});

function art(type: string, a: LibraryArt, id: string, x: number, y: number, w: number, h: number): ModuleInstance {
  return place(type, x, y, w, h, { source: librarySource(id, a, w * 25, h * 25) });
}

function board(title: string, modules: ModuleInstance[], colourUse: "balanced" | "expressive" | "blackwhite" = "balanced"): DashboardDoc {
  const doc = emptyDashboard(title, SHOWCASE_NOW);
  return {
    ...doc,
    modules,
    theme: { ...doc.theme, expression: { ...doc.theme.expression, colourUse } },
  } as DashboardDoc;
}

const sensors = (ids: Array<[string, string]>) =>
  ids.map(([entityId, label]) => ({ entityId, label, name: "" }));

export const SHOWCASE: Array<{ key: string; title: string; doc: DashboardDoc }> = [
  {
    key: "morning-briefing",
    title: "Morning briefing",
    doc: board("Morning briefing", [
      place("headline", 0, 0, 16, 4, {
        variant: "underline",
        kicker: t("THURSDAY 22 OCTOBER", { family: "plexmono", size: 13, weight: "bold" }),
        headline: t("Good morning", { family: "poppins", size: 34, weight: "bold" }),
        subline: t("Sunny spells, 23° by the afternoon", { size: 15 }),
      }),
      rule(place("weatherCompact", 0, 4, 16, 3, { format: "dayParts" }), ["bottom"], 1),
      place("calendarNext", 0, 7, 16, 5, { variant: "list", maxEvents: 2, heading: t("TODAY", { size: 13, weight: "bold" }) }),
    ]),
  },
  {
    key: "home-dashboard",
    title: "Home dashboard",
    doc: board("Home dashboard", [
      rule(place("weatherHero", 0, 0, 8, 7), ["right"], 1),
      place("homeSensors", 8, 0, 8, 7, {
        format: "list",
        entities: sensors([
          ["sensor.living_room_temperature", "Living room"],
          ["sensor.living_room_humidity", "Humidity"],
          ["sensor.bedroom_temperature", "Bedroom"],
          ["sensor.outdoor_temperature", "Outdoor"],
          ["sensor.office_co2", "Office CO2"],
        ]),
      }),
      rule(place("weatherWeek", 0, 7, 16, 3), ["top"], 2),
      rule(place("calendarNext", 0, 10, 16, 2, { variant: "oneLine" }), ["top"], 1),
    ]),
  },
  {
    key: "welcome",
    title: "Welcome to NOTE4C",
    doc: board("Welcome to NOTE4C", [
      art("image", mascot, "mascot", 0, 0, 8, 12),
      place("message", 8, 2, 8, 4, {
        body: t("Welcome to NOTE4C", { size: 34, weight: "bold", align: "center" }),
        verticalAlign: "middle",
      }),
      place("message", 8, 6, 8, 4, {
        body: t("Your panel is ready. Design it from the tower.", { size: 15, align: "center", colour: "accent" }),
        verticalAlign: "top",
      }),
    ]),
  },
  {
    key: "happy-birthday",
    title: "Happy birthday",
    doc: board("Happy birthday", [
      art("image", balloon, "balloon", 0, 0, 16, 9),
      place("message", 0, 9, 16, 3, {
        body: t("Happy birthday, Sam!", { size: 34, weight: "bold", align: "center", colour: "accent" }),
        verticalAlign: "middle",
      }),
    ], "expressive"),
  },
  {
    key: "weekend",
    title: "Weekend",
    doc: board("Weekend", [
      art("image", mountains, "mountains", 0, 0, 16, 6),
      rule(place("weatherWeek", 0, 6, 16, 3), ["bottom"], 1),
      place("list", 0, 9, 10, 3, {
        title: t("THIS WEEKEND", { size: 13, weight: "bold" }),
        marker: "checkbox",
        markerColour: "accent",
        rows: [{ text: "Hike to the lighthouse", visible: true }, { text: "Farmers' market", visible: true }],
      }),
      place("homeSensors", 10, 9, 6, 3, {
        format: "list",
        entities: sensors([["sensor.outdoor_temperature", "Outdoor"], ["sensor.living_room_temperature", "Inside"]]),
      }),
    ]),
  },
  {
    key: "focus",
    title: "Focus / Do not disturb",
    doc: board("Focus", [
      art("image", dnd, "dnd", 0, 0, 16, 8),
      place("message", 0, 8, 16, 2, {
        body: t("Do not disturb", { size: 34, weight: "bold", align: "center", colour: "accent" }),
        verticalAlign: "middle",
      }),
      place("message", 0, 10, 16, 2, {
        body: t("Deep work until 12:00, back after lunch", { size: 15, align: "center" }),
        verticalAlign: "middle",
      }),
    ]),
  },
  {
    key: "kitchen",
    title: "Kitchen",
    doc: board("Kitchen", [
      rule(place("weatherCompact", 0, 0, 16, 3, { format: "dayParts", showWind: false, showFeelsLike: false }), ["bottom"], 2),
      place("list", 0, 3, 9, 9, {
        title: t("SHOPPING", { size: 15, weight: "bold" }),
        marker: "checkbox",
        markerColour: "accent",
        rows: ["Oat milk", "Lemons", "Sourdough", "Coffee beans", "Basil"].map((text) => ({ text, visible: true })),
      }),
      rule(place("homeSensors", 9, 3, 7, 3, {
        format: "tiles",
        entities: sensors([["sensor.living_room_temperature", "Inside"], ["sensor.outdoor_temperature", "Outside"]]),
      }), ["left"], 1),
      rule(art("image", coffee, "coffee", 9, 6, 7, 6), ["left"], 1),
    ]),
  },
];

export function renderShowcase(doc: DashboardDoc): Buffer {
  const ctx: RenderContext = { now: SHOWCASE_NOW, timeZone: SHOWCASE_TZ, lang: "en" };
  return framePng(renderDashboard(doc, SHOWCASE_SOURCES, ctx));
}

const PAPER = "#e9e4da";

/** One framed device in the hero: an illustrated bezel, drawn in CSS. */
function deviceHtml(dataUrl: string, label: string): string {
  return `<figure><div class="device"><div class="screen"><img src="${dataUrl}"></div></div><figcaption>${label}</figcaption></figure>`;
}

const HERO_CSS = `
  *{box-sizing:border-box;margin:0}
  body{background:${PAPER};font:600 15px/1.2 ui-sans-serif,-apple-system,"Helvetica Neue",Arial,sans-serif;color:#3a3734}
  #hero{display:grid;grid-template-columns:repeat(3,440px);gap:36px 40px;padding:56px 64px 48px;width:max-content;background:radial-gradient(ellipse at 50% 0%,#f5f1ea 0%,${PAPER} 70%)}
  figure{display:flex;flex-direction:column;align-items:center;gap:14px}
  .device{position:relative;padding:18px 18px 30px;border-radius:16px;background:linear-gradient(160deg,#ffffff,#eeebe5);box-shadow:0 18px 30px -12px rgba(40,30,20,.35),inset 0 0 0 1px rgba(0,0,0,.08),inset 0 1px 0 #fff}
  .screen{padding:2px;background:#f7f4ee;border-radius:3px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}
  .screen img{display:block;width:400px;height:300px;image-rendering:pixelated}
  figcaption{letter-spacing:.02em}
  .twox{display:block;width:800px;height:600px;image-rendering:pixelated}
`;

async function compose(outDir: string, files: Array<{ key: string; title: string; file: string }>): Promise<void> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const urls = files.map((f) => `data:image/png;base64,${fs.readFileSync(f.file).toString("base64")}`);
    // 2x: nearest-neighbour, one element screenshot each.
    for (const [i, f] of files.entries()) {
      await page.setContent(`<style>${HERO_CSS}</style><img class="twox" id="p" src="${urls[i]}">`);
      await page.locator("#p").screenshot({ path: path.join(outDir, `${f.key}@2x.png`) });
    }
    // Hero: six framed panels, rendered at 2x for retina-crisp README display.
    const hero = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1000 } });
    await hero.setContent(
      `<style>${HERO_CSS}</style><div id="hero">${files.slice(0, 6).map((f, i) => deviceHtml(urls[i]!, f.title)).join("")}</div>`,
    );
    await hero.locator("#hero").screenshot({ path: path.join(outDir, "hero.png") });
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const outDir = path.resolve(process.argv[2] ?? "docs/images/showcase");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const written: Array<{ key: string; title: string; file: string }> = [];
  for (const item of SHOWCASE) {
    const file = path.join(outDir, `${item.key}.png`);
    fs.writeFileSync(file, renderShowcase(item.doc));
    written.push({ key: item.key, title: item.title, file });
  }
  await compose(outDir, written);
  console.log(`${written.length} showcase panels (+@2x, hero.png) written to ${outDir}`);
}

if (process.argv[1]?.endsWith("showcase.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
