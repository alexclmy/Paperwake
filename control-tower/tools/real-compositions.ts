/**
 * Three demo compositions built only from real modules and options, rendered
 * by the real panel renderer over the fictional showcase fixtures.
 *
 *     npx tsx tools/real-compositions.ts <outDir>
 *
 * Writes per composition: <key>.json (DashboardDoc, importable in the editor),
 * <key>.png (400x300), <key>@3x.png, <key>-framed.png, plus compare.png.
 */

import fs from "node:fs";
import path from "node:path";
import type { DashboardDoc, ModuleInstance } from "@/core/model";
import { emptyDashboard, newModuleId } from "@/core/model";
import { MODULES } from "@/core/render/modules";
import { librarySource } from "@/core/library/source";
import type { LibraryArt } from "@/core/library/catalog";
import * as sunrise from "@/core/library/art/sunrise";
import { renderShowcase, SHOWCASE_NOW } from "./showcase";

function place(type: string, x: number, y: number, w: number, h: number, options: object = {}): ModuleInstance {
  return { id: newModuleId(), type, x, y, w, h, hidden: false, options: { ...(MODULES[type]?.defaultOptions as object), ...options } };
}
const t = (text: string, style: object = {}) => ({ text, visible: true, style });
const rule = (m: ModuleInstance, edges: Array<"top" | "bottom" | "left" | "right">, weight = 1): ModuleInstance => ({
  ...m,
  frame: { edges, weight, style: "solid", inset: 0, color: 0 },
});
const art = (a: LibraryArt, id: string, x: number, y: number, w: number, h: number) =>
  place("image", x, y, w, h, { source: librarySource(id, a, w * 25, h * 25) });
const board = (title: string, modules: ModuleInstance[], colourUse = "balanced"): DashboardDoc => {
  const doc = emptyDashboard(title, SHOWCASE_NOW);
  return { ...doc, modules, theme: { ...doc.theme, expression: { ...doc.theme.expression, colourUse } } } as DashboardDoc;
};
const ent = (entityId: string, label: string) => ({ entityId, label, name: "" });

export const COMPOSITIONS: Array<{ key: string; title: string; doc: DashboardDoc }> = [
  {
    key: "home-dashboard",
    title: "Home dashboard",
    doc: board("Home dashboard", [
      rule(place("weatherHero", 0, 0, 9, 9), ["right"]),
      place("calendarNext", 9, 0, 7, 6, { variant: "list", maxEvents: 3, heading: t("TODAY", { size: 13, weight: "bold" }) }),
      rule(place("homeSensors", 9, 6, 7, 3, {
        format: "tiles",
        entities: [ent("sensor.living_room_temperature", "Indoor"), ent("sensor.living_room_humidity", "Humidity")],
      }), ["top"]),
      rule(place("weatherWeek", 0, 9, 16, 3), ["top"], 2),
    ]),
  },
  {
    key: "good-day",
    title: "Good day",
    doc: board("Good day", [
      art(sunrise, "sunrise", 0, 0, 16, 10),
      place("message", 0, 10, 16, 2, {
        body: t("TODAY IS A GOOD DAY", { family: "poppins", size: 22, weight: "bold", align: "center", colour: "accent" }),
        verticalAlign: "middle",
      }),
    ], "expressive"),
  },
  {
    key: "morning",
    title: "Morning",
    doc: board("Morning", [
      place("weatherHero", 0, 0, 16, 6, { rangeLine: t("H {high}°   ·   L {low}°", { family: "plexmono", size: 15, weight: "bold" }) }),
      rule(place("calendarNext", 0, 6, 10, 6, { variant: "list", maxEvents: 2, heading: t("NEXT UP", { size: 13, weight: "bold", colour: "accent" }) }), ["top"]),
      rule(place("homeSensors", 10, 6, 6, 6, { format: "tiles", labelStyle: { size: 15, weight: "bold" }, valueStyle: { family: "poppins", size: 34, weight: "bold" }, entities: [ent("sensor.living_room_temperature", "Indoor")] }), ["top", "left"]),
    ]),
  },
];

const FRAME_CSS = `*{box-sizing:border-box;margin:0}body{background:#e9e4da;font:600 15px ui-sans-serif,-apple-system,Arial}
.wrap{padding:48px;display:flex;gap:40px;width:max-content;background:radial-gradient(ellipse at 50% 0%,#f5f1ea,#e9e4da 70%)}
figure{display:flex;flex-direction:column;align-items:center;gap:14px;color:#3a3734}
.device{padding:18px 18px 30px;border-radius:16px;background:linear-gradient(160deg,#fff,#eeebe5);box-shadow:0 18px 30px -12px rgba(40,30,20,.35),inset 0 0 0 1px rgba(0,0,0,.08)}
.screen{padding:2px;background:#f7f4ee;border-radius:3px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}
.screen img{display:block;width:400px;height:300px;image-rendering:pixelated}
.x3{display:block;width:1200px;height:900px;image-rendering:pixelated}`;

async function main(): Promise<void> {
  const out = path.resolve(process.argv[2] ?? "real-compositions");
  fs.mkdirSync(out, { recursive: true });
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1000 } });
    const p1 = await browser.newPage({ deviceScaleFactor: 1 });
    const figs: string[] = [];
    for (const c of COMPOSITIONS) {
      fs.writeFileSync(path.join(out, `${c.key}.json`), JSON.stringify(c.doc, null, 2) + "\n");
      const png = renderShowcase(c.doc);
      fs.writeFileSync(path.join(out, `${c.key}.png`), png);
      const url = `data:image/png;base64,${png.toString("base64")}`;
      await p1.setContent(`<style>${FRAME_CSS}</style><img class="x3" id="p" src="${url}">`);
      await p1.locator("#p").screenshot({ path: path.join(out, `${c.key}@3x.png`) });
      const fig = `<figure><div class="device"><div class="screen"><img src="${url}"></div></div><figcaption>${c.title}</figcaption></figure>`;
      figs.push(fig);
      await page.setContent(`<style>${FRAME_CSS}</style><div class="wrap" id="w">${fig}</div>`);
      await page.locator("#w").screenshot({ path: path.join(out, `${c.key}-framed.png`) });
    }
    await page.setContent(`<style>${FRAME_CSS}</style><div class="wrap" id="w">${figs.join("")}</div>`);
    await page.locator("#w").screenshot({ path: path.join(out, "compare.png") });
  } finally {
    await browser.close();
  }
  console.log(`${COMPOSITIONS.length} compositions written to ${out}`);
}

if (process.argv[1]?.endsWith("real-compositions.ts")) {
  main().catch((e: unknown) => { console.error(e); process.exitCode = 1; });
}
