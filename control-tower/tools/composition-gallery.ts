/**
 * The composition gallery in docs/images/compositions/, made reproducibly.
 *
 * Run by hand, committed as PNGs:
 *
 *     npx tsx tools/composition-gallery.ts [outDir]
 *
 * Every starting composition the designer offers, rendered by the real
 * renderer over a fixed, fictional set of sources — a "Sample City" forecast,
 * a made-up agenda, a fixed instant — so each picture is exactly the frame the
 * panel would show, a re-run is byte-identical, and nothing on it is a fact
 * about anybody's home.
 *
 * Each PNG is the full 400×300 panel in the four panel pigments. When
 * ImageMagick is on the PATH a 2× copy of each and a contact sheet are added.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { renderDashboard } from "@/core/render";
import type { DashboardSources } from "@/core/render/data";
import { DEFAULT_REMINDERS_LIST } from "@/core/render/data";
import type { RenderContext } from "@/core/render/types";
import { emptyDashboard, newModuleId, type DashboardDoc, type ModuleInstance } from "@/core/model";
import { MODULES } from "@/core/render/modules";
import { DEFAULT_LATITUDE, DEFAULT_LONGITUDE } from "@/core/render/time";
import { TEMPLATES } from "@/core/templates";
import { framePng } from "@/server/png";

/** A Thursday, early afternoon, late September. */
const NOW = new Date("2026-09-24T12:30:00.000Z");
/**
 * A fixed, neutral place and zone — the renderer's own fallback — so nothing
 * depends on the machine this runs on: left to their defaults the Sky and the
 * timestamp would read the host's timezone and put it in the pictures.
 */
const TIME_ZONE = "Europe/Paris";
const PLACE = { latitude: DEFAULT_LATITUDE, longitude: DEFAULT_LONGITUDE, timeZone: TIME_ZONE };

const observedAt = NOW.toISOString();

const SOURCES: DashboardSources = {
  weather: {
    state: "ok",
    observedAt,
    value: {
      slots: [
        { time: "12h", temp: 18, condition: "partlycloudy" },
        { time: "18h", temp: 16, condition: "cloudy" },
        { time: "00h", temp: 11, condition: "clear-night" },
        { time: "06h", temp: 9, condition: "sunny" },
      ],
      low: 9,
      high: 21,
      hours: 24,
      unit: "°C",
      locationLabel: "Sample City",
      locationWarning: false,
      condition: "partlycloudy",
      isDay: true,
      days: [
        { label: "THU", condition: "partlycloudy", high: 21, low: 9 },
        { label: "FRI", condition: "rainy", high: 17, low: 10 },
        { label: "SAT", condition: "lightning-rainy", high: 19, low: 12 },
        { label: "SUN", condition: "sunny", high: 23, low: 11 },
        { label: "MON", condition: "sunny", high: 22, low: 10 },
        { label: "TUE", condition: "cloudy", high: 18, low: 9 },
        { label: "WED", condition: "snowy", high: 4, low: -2 },
      ],
    },
  },
  calendar: {
    state: "ok",
    observedAt,
    value: {
      events: [
        {
          title: "School run",
          when: "24/09 08:15",
          start: "2026-09-24T08:15:00.000Z",
          end: "2026-09-24T08:45:00.000Z",
        },
        {
          title: "Dentist",
          when: "24/09 14:30",
          start: "2026-09-24T14:30:00.000Z",
          end: "2026-09-24T15:15:00.000Z",
        },
        {
          title: "Dinner with friends",
          when: "24/09 19:30",
          start: "2026-09-24T19:30:00.000Z",
          end: "2026-09-24T22:00:00.000Z",
        },
        {
          title: "Farmers' market",
          when: "26/09 · all day",
          start: "2026-09-26T00:00:00.000Z",
          end: "2026-09-27T00:00:00.000Z",
        },
      ],
    },
  },
  sensors: {
    "sensor.example_temperature": {
      state: "ok",
      observedAt,
      value: { label: "Hallway", value: "19.4 °C" },
    },
  },
  reminders: {
    state: "ok",
    observedAt,
    value: { openCount: 3, overdueCount: 1, listName: DEFAULT_REMINDERS_LIST },
  },
};

/** Pin every Sky to the neutral place and zone. */
function neutral(doc: DashboardDoc): DashboardDoc {
  return {
    ...doc,
    modules: doc.modules.map((m) =>
      m.type === "sky" ? { ...m, options: { ...(m.options as object), ...PLACE } } : m,
    ),
  };
}

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

/**
 * Two boards that are not starting templates but show what the modules can do:
 * the illustrated weather hero over the seven-day strip, and a night sky.
 */
const SHOWCASE: Array<{ key: string; doc: DashboardDoc }> = [
  {
    key: "weekAhead",
    doc: {
      ...emptyDashboard("Week ahead", NOW),
      modules: [
        { ...place("weatherHero", 0, 0, 8, 4), frame: { edges: ["bottom"], weight: 2, style: "solid", inset: 0, color: 0 } },
        place("weatherWeek", 0, 4, 8, 2),
      ],
    },
  },
];

function hasMagick(): boolean {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  const outDir = path.resolve(process.argv[2] ?? "docs/images/compositions");
  fs.mkdirSync(outDir, { recursive: true });
  const ctx: RenderContext = { now: NOW, timeZone: TIME_ZONE };
  const written: string[] = [];

  // Every starting template but Blank, and Photo & day, which is a frame
  // waiting for the owner's own picture; then the showcase boards.
  const boards = [
    ...TEMPLATES.filter((t) => t.key !== "blank" && t.key !== "photoDay").map((t) => ({
      key: t.key,
      doc: t.build(NOW),
    })),
    ...SHOWCASE,
  ];
  for (const board of boards) {
    const file = path.join(outDir, `${board.key}.png`);
    fs.writeFileSync(file, framePng(renderDashboard(neutral(board.doc), SOURCES, ctx)));
    written.push(file);
  }

  if (hasMagick()) {
    // Each composition at 2×, nearest-neighbour so the dither stays crisp, on
    // a paper-coloured mat with a hairline — how it looks on a web page.
    const mats: string[] = [];
    for (const file of written) {
      const mat = file.replace(/\.png$/, "@2x.png");
      execFileSync("magick", [
        file,
        "-filter", "point", "-resize", "200%",
        "-bordercolor", "#111111", "-border", "2",
        "-bordercolor", "#efeae0", "-border", "24",
        mat,
      ]);
      mats.push(mat);
    }
    const row = (items: string[]): string[] => ["(", ...items, "+append", ")"];
    execFileSync("magick", [
      ...row(mats.slice(0, 3)),
      ...row(mats.slice(3, 6)),
      "-background", "#efeae0",
      "-append",
      "+repage",
      path.join(outDir, "gallery.png"),
    ]);
  }

  console.log(`${written.length} compositions written to ${outDir}`);
}

main();
