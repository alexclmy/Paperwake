import { z } from "zod";
import type { FrameBuffer } from "@/core/frame";
import { BLACK, RED, WHITE } from "@/core/palette";
import { DEFAULT_EXPRESSION } from "@/core/theme";
import { moonPhase } from "../astronomy";
import { scrubIsolatedAccents, type DitherStyle } from "../dither";
import {
  atlasFor,
  drawText,
  filled,
  reservedHeight,
  textElementSchema,
  textStyleSchema,
} from "../text";
import type { WeatherValue } from "../data";
import { LAYOUT_VARIANT_TAG, type ModuleDefinition } from "../types";
import {
  WEATHER_SCENES,
  drawWeatherScene,
  inkWithHalo,
  sceneForCondition,
} from "../weatherScenes";
import {
  clearModule,
  inner,
  provenanceShape,
  renderProvenance,
  renderUnavailable,
  staleShape,
  unavailableShape,
} from "./common";

/**
 * Weather hero — the number you read from the doorway.
 *
 * A full-bleed risograph sky (the same dither engine Sky uses) with the current
 * temperature set very large over it, the condition above and the day's range
 * below. It is the first module built for the 48/64 px atlas tier: the point is
 * a temperature that carries a room, not a slot in a strip.
 *
 * COLOUR obeys the dashboard's Expression. The warm field is yellow; an
 * Expressive board turns the sun red. Every accent is laid through the dither
 * engine and the frame is scrubbed once at the end, so the 2 px accent law
 * holds — which is also why the type is ink, never a thin red glyph the panel
 * would drop.
 *
 * SCENES. The sky is illustrated from the condition now — sun, broken cloud,
 * overcast, rain, downpour, storm, snow, sleet, hail, fog, wind — and drawn by
 * night (ink sky, the moon at its real phase, stars) when the source says the
 * sun is down. Both can be pinned by the owner; "auto" follows the data. An
 * unknown condition gets a neutral sky and no picture rather than a guess.
 *
 * DATA. The big number is the +0 h slot (the reading for now) and the range is
 * the window's low/high; the condition is the current one. Nothing here is
 * invented — an unavailable source renders an explicit unavailable state.
 */
export const WEATHER_HERO_SCENES = ["auto", ...WEATHER_SCENES] as const;
export const WEATHER_HERO_TIMES = ["auto", "day", "night"] as const;

export const WeatherHeroOptions = z.object({
  /** Which sky to draw. "auto" follows the condition; the rest pin a scene. Chosen by thumbnail. */
  scene: z.enum(WEATHER_HERO_SCENES).default("auto").describe(LAYOUT_VARIANT_TAG),
  /** Day or night sky. "auto" follows the source's sunrise and sunset. */
  timeOfDay: z.enum(WEATHER_HERO_TIMES).default("auto"),
  /** A place name the owner chooses, off by default (the source never asserts one). */
  location: textElementSchema({
    text: "",
    maxLength: 40,
    visible: false,
    style: { family: "plexmono", size: 13, weight: "bold" },
  }).default({}),
  conditionLine: textElementSchema({
    text: "{condition}",
    maxLength: 40,
    style: { family: "poppins", size: 22, weight: "bold" },
  }).default({}),
  /** The hero. Large by design — this is the module's whole reason to exist. */
  tempStyle: textStyleSchema({
    family: "poppins",
    size: 64,
    weight: "bold",
  }).default({}),
  rangeLine: textElementSchema({
    text: "H {high}°   ·   L {low}°",
    maxLength: 40,
    style: { family: "plexmono", size: 15, weight: "bold" },
  }).default({}),
  ...staleShape("Prévision périmée, affichée telle quelle"),
  ...unavailableShape({
    title: "Météo indisponible",
    note: "Aucune valeur inventée",
  }),
  ...provenanceShape({ size: 11 }),
});
export type WeatherHeroOptions = z.infer<typeof WeatherHeroOptions>;

const CONDITION_LABELS: Record<string, string> = {
  sunny: "Sunny",
  "clear-night": "Clear",
  partlycloudy: "Partly cloudy",
  cloudy: "Cloudy",
  rainy: "Rain",
  pouring: "Heavy rain",
  lightning: "Storms",
  "lightning-rainy": "Storms",
  snowy: "Snow",
  "snowy-rainy": "Sleet",
  fog: "Fog",
  windy: "Windy",
  hail: "Hail",
  exceptional: "Extreme",
};

function humaniseCondition(code: string, night: boolean): string {
  // "Sunny" after dark is wrong on its face; the sky is clear.
  if (night && code === "sunny") return "Clear";
  const known = CONDITION_LABELS[code];
  if (known) return known;
  const spaced = code.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : code;
}

export const weatherHero: ModuleDefinition<WeatherHeroOptions, WeatherValue> = {
  type: "weatherHero",
  label: "Weather hero",
  description:
    "The current temperature, set very large over a risograph sky, with the condition and the day's high and low. Reads from across the room. Renders an explicit unavailable state rather than any placeholder number.",
  schema: WeatherHeroOptions,
  defaultOptions: WeatherHeroOptions.parse({}),
  defaultSpan: { w: 8, h: 4 },
  minSpan: { w: 5, h: 3 },
  maxSpan: { w: 8, h: 6 },
  sourceBinding: "weather",

  render(fb, rect, data, options, ctx) {
    clearModule(fb, rect);
    const reporter = ctx.report;
    const report = reporter ? { reporter } : {};

    if (data.state === "unavailable" || !data.value) {
      renderUnavailable(fb, rect, options, reporter);
      return;
    }

    const weather = data.value;
    const expression = ctx.theme?.expression ?? DEFAULT_EXPRESSION;
    const bw = expression.colourUse === "blackwhite";
    const expressive = expression.colourUse === "expressive";

    // The hero sky is a poster, not a texture swatch: it always reads in the
    // newsprint HALFTONE brush — round dots that grow from their centres — the
    // way a risograph weather poster does, whatever brush the rest of the board
    // uses. Dot SIZE still follows the board's pixel texture.
    const skyStyle: DitherStyle = {
      brush: "halftone",
      texture: expression.pixelTexture,
    };

    const night =
      options.timeOfDay === "night" ||
      (options.timeOfDay === "auto" && weather.isDay === false);
    const scene =
      options.scene === "auto" ? sceneForCondition(weather.condition) : options.scene;
    drawWeatherScene(fb, rect, {
      scene,
      night,
      colourUse: expression.colourUse,
      style: skyStyle,
      moon: moonPhase(ctx.now),
    });
    // Ink type on a warm sunny field is the approved poster look; on any
    // darker or busier sky the type gets a paper halo so it always reads.
    const halo = !(scene === "clear" && !night && !bw);
    const ink = (draw: (target: FrameBuffer) => number): number =>
      halo ? inkWithHalo(fb, rect, draw) : draw(fb);

    // Type, all ink, over the field.
    const box = inner(rect);
    let topY = box.y;
    topY = ink((t) => drawText(t, { ...box, y: topY, h: box.h - (topY - box.y) }, options.location, BLACK, "location", report).nextY);
    if (weather.locationLabel && options.showProvenance) {
      const at = topY;
      topY = ink((t) =>
        renderProvenance(
          t,
          { ...box, y: at, h: box.h - (at - box.y) },
          options,
          weather.locationLabel,
          weather.locationWarning ? RED : BLACK,
          reporter,
        ),
      );
    }
    const conditionY = topY;
    ink((t) =>
      drawText(
        t,
        { ...box, y: conditionY, h: box.h - (conditionY - box.y) },
        filled(options.conditionLine, { condition: humaniseCondition(weather.condition, night) }),
        BLACK,
        "conditionLine",
        report,
      ).nextY,
    );

    // The hero number and the range, anchored to the foot.
    const rangeH = reservedHeight({
      text: "H 00° · L 00°",
      visible: options.rangeLine.visible,
      style: options.rangeLine.style,
    });
    const tempText = `${weather.slots[0]?.temp ?? weather.high}°`;
    const tempAtlas = atlasFor(options.tempStyle);
    const tempH = tempAtlas.lineHeight;
    const tempY = Math.max(topY, box.y + box.h - rangeH - tempH);
    ink((t) => {
      t.drawText(tempAtlas, box.x, tempY, tempText, BLACK);
      return tempY;
    });

    if (options.rangeLine.visible) {
      ink((t) =>
        drawText(
        t,
        { x: box.x, y: tempY + tempH, w: box.w, h: rangeH },
        filled(options.rangeLine, {
          high: weather.high,
          low: weather.low,
          unit: weather.unit,
        }),
        BLACK,
        "rangeLine",
        report,
        ).nextY,
      );
    }

    if (data.state === "stale") {
      ink((t) =>
        drawText(t, { ...box, y: box.y, h: box.h }, options.staleLabel, BLACK, "staleLabel", report).nextY,
      );
    }

    // The second half of the 2 px guarantee: any accent sliver an ink glyph,
    // a halo or an outline cut from the field is removed here.
    scrubIsolatedAccents(fb, rect, WHITE);
  },
};

