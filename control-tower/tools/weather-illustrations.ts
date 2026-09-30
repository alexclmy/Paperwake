/**
 * The Weather hero illustration set in docs/images/weather-hero/, made reproducibly.
 *
 * Run by hand, committed as PNGs:
 *
 *     npx tsx tools/weather-illustrations.ts [outDir]
 *
 * Every scene, by day and by night, in each colour stance, rendered by the real
 * renderer over a fixed fixture ("Sample City", a fixed instant) — so the
 * pictures are the exact bytes the panel would show, a re-run is byte-identical,
 * and nothing on them is a fact about the machine that made them.
 *
 * Each PNG is the full 400×300 panel in the four panel pigments. When
 * ImageMagick is on the PATH a 2× contact sheet per stance is added beside them.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FrameBuffer } from "@/core/frame";
import { WHITE } from "@/core/palette";
import type { WeatherValue } from "@/core/render/data";
import { moduleDefinition } from "@/core/render/modules";
import { cellsToPixels, type RenderContext } from "@/core/render/types";
import { WEATHER_SCENES, type WeatherScene } from "@/core/render/weatherScenes";
import { COLOUR_USES, DashboardThemeSchema, type ColourUse } from "@/core/theme";
import { framePng } from "@/server/png";

/** A waxing crescent, so the night pictures show the moon's shape. */
const NOW = new Date("2026-09-17T02:00:00.000Z");

const CONDITION: Record<WeatherScene, string> = {
  clear: "sunny",
  partly: "partlycloudy",
  cloudy: "cloudy",
  rain: "rainy",
  pouring: "pouring",
  storm: "lightning-rainy",
  snow: "snowy",
  sleet: "snowy-rainy",
  hail: "hail",
  fog: "fog",
  wind: "windy",
};

const TEMPS: Record<WeatherScene, [now: number, low: number, high: number]> = {
  clear: [24, 16, 27],
  partly: [19, 13, 22],
  cloudy: [14, 11, 16],
  rain: [12, 9, 14],
  pouring: [11, 9, 13],
  storm: [22, 17, 28],
  snow: [-4, -9, -2],
  sleet: [1, -2, 3],
  hail: [9, 5, 12],
  fog: [7, 4, 11],
  wind: [10, 6, 13],
};

function fixture(scene: WeatherScene, night: boolean): WeatherValue {
  const [now, low, high] = TEMPS[scene];
  const condition = CONDITION[scene];
  return {
    slots: [
      { time: "13h", temp: now, condition },
      { time: "19h", temp: now - 2, condition },
      { time: "01h", temp: low, condition },
      { time: "07h", temp: low + 1, condition },
    ],
    low,
    high,
    hours: 24,
    unit: "°C",
    locationLabel: "Sample City",
    locationWarning: false,
    condition,
    isDay: !night,
  };
}

function render(scene: WeatherScene, night: boolean, colourUse: ColourUse): FrameBuffer {
  const definition = moduleDefinition("weatherHero");
  const theme = DashboardThemeSchema.parse({ expression: { colourUse } });
  const ctx: RenderContext = { now: NOW, timeZone: "UTC", theme };
  const fb = new FrameBuffer(WHITE);
  definition.render(
    fb,
    cellsToPixels(0, 0, 8, 6),
    { state: "ok", value: fixture(scene, night) },
    definition.schema.parse({}),
    ctx,
  );
  return fb;
}

function hasMagick(): boolean {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  const outDir = path.resolve(process.argv[2] ?? "docs/images/weather-hero");
  fs.mkdirSync(outDir, { recursive: true });
  const written: Record<ColourUse, string[]> = { blackwhite: [], balanced: [], expressive: [] };

  for (const colourUse of COLOUR_USES) {
    for (const night of [false, true]) {
      for (const scene of WEATHER_SCENES) {
        const name = `${colourUse}-${night ? "night" : "day"}-${scene}.png`;
        fs.writeFileSync(path.join(outDir, name), framePng(render(scene, night, colourUse)));
        written[colourUse].push(name);
      }
    }
  }

  if (hasMagick()) {
    for (const colourUse of COLOUR_USES) {
      const sheet = path.join(outDir, `sheet-${colourUse}.png`);
      // Day on the top row, night below, scenes in the same order across.
      const row = (night: boolean): string[] => [
        "(",
        ...written[colourUse]
          .filter((name) => name.includes(night ? "-night-" : "-day-"))
          .map((name) => path.join(outDir, name)),
        "-filter", "point", "-resize", "200%",
        "-bordercolor", "#d8d4cc", "-border", "8",
        "+append",
        ")",
      ];
      execFileSync("magick", [...row(false), ...row(true), "-append", sheet]);
    }

    // A curated strip for a README: four days and four nights, balanced
    // stance, 2× nearest-neighbour on a paper mat, then halved for the web.
    const pick = [
      "day-clear", "day-partly", "day-rain", "day-storm",
      "night-clear", "night-snow", "night-fog", "night-wind",
    ].map((k) => path.join(outDir, `balanced-${k}.png`));
    const mat = (file: string): string[] => [
      "(", file, "-filter", "point", "-resize", "200%",
      "-bordercolor", "#111111", "-border", "2",
      "-bordercolor", "#efeae0", "-border", "20", ")",
    ];
    execFileSync("magick", [
      "(", ...pick.slice(0, 4).flatMap(mat), "+append", ")",
      "(", ...pick.slice(4).flatMap(mat), "+append", ")",
      "-append", "-filter", "point", "-resize", "50%", "+repage",
      path.join(outDir, "showcase.png"),
    ]);
  }

  const total = Object.values(written).reduce((n, list) => n + list.length, 0);
  console.log(`${total} illustrations written to ${outDir}`);
}

main();
