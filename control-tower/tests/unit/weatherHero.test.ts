import { describe, expect, it } from "vitest";
import { FrameBuffer, pack } from "@/core/frame";
import { BLACK, WHITE, YELLOW } from "@/core/palette";
import { WEATHER_SCENES, sceneForCondition } from "@/core/render/weatherScenes";
import { moduleDefinition } from "@/core/render/modules";
import { countIsolatedAccents } from "@/core/render/dither";
import { cellsToPixels, type ModuleData, type RenderContext } from "@/core/render/types";
import { DashboardThemeSchema, type Expression } from "@/core/theme";
import type { WeatherValue } from "@/core/render/data";
import { sha256HexSync } from "@/server/hash";

const NOW = new Date("2026-09-20T13:00:00.000Z");

const WEATHER: WeatherValue = {
  slots: [
    { time: "13h", temp: 18, condition: "partlycloudy" },
    { time: "19h", temp: 14, condition: "cloudy" },
    { time: "01h", temp: 10, condition: "clear-night" },
    { time: "07h", temp: 12, condition: "sunny" },
  ],
  low: 9,
  high: 24,
  hours: 24,
  unit: "°C",
  locationLabel: "Sample City",
  locationWarning: false,
  condition: "partlycloudy",
};

function ctxFor(expression: Partial<Expression>): RenderContext {
  const theme = DashboardThemeSchema.parse({ expression });
  return { now: NOW, timeZone: "America/Toronto", theme };
}

function render(
  expression: Partial<Expression>,
  data: ModuleData<WeatherValue> = { state: "ok", value: WEATHER },
  options: Record<string, unknown> = {},
): FrameBuffer {
  const definition = moduleDefinition("weatherHero");
  const fb = new FrameBuffer(WHITE);
  definition.render(fb, cellsToPixels(0, 0, 8, 4), data, definition.schema.parse(options), ctxFor(expression));
  return fb;
}

const withWeather = (patch: Partial<WeatherValue>): ModuleData<WeatherValue> => ({
  state: "ok",
  value: { ...WEATHER, ...patch },
});

const digest = (fb: FrameBuffer): string => sha256HexSync(pack(fb));
const count = (fb: FrameBuffer, idx: number): number => {
  let c = 0;
  for (const p of fb.pixels) if (p === idx) c += 1;
  return c;
};

describe("weatherHero module", () => {
  it("packs cleanly and leaves no isolated accent, every colour stance", () => {
    for (const colourUse of ["blackwhite", "balanced", "expressive"] as const) {
      const fb = render({ colourUse });
      expect(() => pack(fb)).not.toThrow();
      expect(countIsolatedAccents(fb)).toBe(0);
      // the hero number is drawn in ink
      expect(count(fb, BLACK)).toBeGreaterThan(0);
    }
  });

  it("lays a warm field when colour is allowed, and none in black & white", () => {
    expect(count(render({ colourUse: "balanced" }), YELLOW)).toBeGreaterThan(0);
    expect(count(render({ colourUse: "blackwhite" }), YELLOW)).toBe(0);
  });

  it("is deterministic: same options and context, byte-identical", () => {
    expect(digest(render({ colourUse: "expressive" }))).toBe(
      digest(render({ colourUse: "expressive" })),
    );
  });

  it("renders an explicit unavailable state rather than inventing a number", () => {
    const fb = render({ colourUse: "balanced" }, { state: "unavailable" });
    expect(() => pack(fb)).not.toThrow();
    expect(countIsolatedAccents(fb)).toBe(0);
  });

  it("draws every scene by day and by night, inside its rect, in every colour stance", () => {
    const below = cellsToPixels(0, 0, 8, 4).h * FrameBuffer.WIDTH;
    for (const colourUse of ["blackwhite", "balanced", "expressive"] as const) {
      for (const scene of WEATHER_SCENES) {
        for (const timeOfDay of ["day", "night"] as const) {
          const fb = render({ colourUse }, undefined, { scene, timeOfDay });
          expect(() => pack(fb)).not.toThrow();
          expect(countIsolatedAccents(fb)).toBe(0);
          // nothing bleeds into the module underneath
          expect(fb.pixels.subarray(below).every((p) => p === WHITE)).toBe(true);
        }
      }
    }
  });

  it("gives every scene a picture of its own", () => {
    const digests = new Set(
      WEATHER_SCENES.map((scene) => digest(render({ colourUse: "balanced" }, undefined, { scene }))),
    );
    expect(digests.size).toBe(WEATHER_SCENES.length);
  });

  it("follows the source's day or night when left on auto, and draws day when it is unsaid", () => {
    const night = digest(render({ colourUse: "balanced" }, withWeather({ isDay: false })));
    const day = digest(render({ colourUse: "balanced" }, withWeather({ isDay: true })));
    const unsaid = digest(render({ colourUse: "balanced" }));
    expect(night).not.toBe(day);
    expect(unsaid).toBe(day);
    expect(digest(render({ colourUse: "balanced" }, withWeather({ isDay: true }), { timeOfDay: "night" }))).toBe(night);
  });

  it("picks the scene from the condition now, and does not guess an unknown one", () => {
    expect(sceneForCondition("lightning-rainy")).toBe("storm");
    expect(sceneForCondition("snowy-rainy")).toBe("sleet");
    expect(sceneForCondition("clear-night")).toBe("clear");
    expect(sceneForCondition("volcanic")).toBeNull();
    const rainy = digest(render({ colourUse: "balanced" }, withWeather({ condition: "rainy" })));
    expect(rainy).toBe(digest(render({ colourUse: "balanced" }, withWeather({ condition: "rainy" }), { scene: "rain" })));
    const unknown = render({ colourUse: "balanced" }, withWeather({ condition: "volcanic" }));
    expect(() => pack(unknown)).not.toThrow();
    expect(count(unknown, YELLOW)).toBe(0);
  });

  it("keeps the approved sunny poster: ink type straight on the warm field", () => {
    const sunny = render({ colourUse: "balanced" }, withWeather({ condition: "sunny", isDay: true }));
    expect(count(sunny, YELLOW)).toBeGreaterThan(0);
    expect(digest(sunny)).toBe(digest(render({ colourUse: "balanced" }, withWeather({ condition: "sunny" }), { scene: "clear", timeOfDay: "day" })));
  });
});
