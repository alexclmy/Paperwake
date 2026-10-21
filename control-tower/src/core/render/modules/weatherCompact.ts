import { z } from "zod";
import { BLACK, RED } from "@/core/palette";
import { WEATHER_ICON_H, WEATHER_ICON_W, drawWeatherIcon } from "../sprites";
import { drawText, layoutText, reservedHeight, textStyleSchema } from "../text";
import { FONT_SIZES } from "@/core/font";
import type { WeatherValue } from "../data";
import { LAYOUT_VARIANT_TAG, type ModuleDefinition } from "../types";
import {
  clearModule,
  inner,
  renderUnavailable,
  staleShape,
  unavailableShape,
} from "./common";
import { compass, localizeDefault, pt, type PanelLang, type PanelStringKey } from "../i18n";

/**
 * Weather, compact.
 *
 * Two formats picked by thumbnail in the inspector:
 *  - "oneLine": "9° nuageux · ressenti 6° · vent 18 km/h · pluie 40 %"
 *  - "dayParts": the line above, then matin / midi / soir with temp, icon and
 *    rain chance.
 * Each extra is a toggle, and a field the source did not provide is left out,
 * never shown as zero. New module: no stored composition is affected.
 */
export const WEATHER_COMPACT_VARIANTS = ["auto", "oneLine", "dayParts"] as const;

/** "auto": the day summary only when the tile is tall enough to show it. */
export function resolveWeatherCompactFormat(
  format: (typeof WEATHER_COMPACT_VARIANTS)[number],
  heightPx: number,
): "oneLine" | "dayParts" {
  if (format !== "auto") return format;
  return heightPx >= 75 ? "dayParts" : "oneLine";
}

export const WeatherCompactOptions = z.object({
  format: z.enum(WEATHER_COMPACT_VARIANTS).default("oneLine").describe(LAYOUT_VARIANT_TAG),
  /** Line 1: current temperature and condition ("12° ensoleillé"). */
  showCurrent: z.boolean().default(true),
  showFeelsLike: z.boolean().default(true),
  showWind: z.boolean().default(true),
  /** Line 1: rain chance right now. */
  showRain: z.boolean().default(true),
  showDaySummary: z.boolean().default(true),
  /** Day summary: temperature under each part. */
  showPartTemp: z.boolean().default(true),
  /**
   * Day summary: rain chance under each part. Optional on purpose: a stored
   * module that predates this toggle has none, and then follows `showRain`
   * exactly as it did before, so its panel bytes do not move.
   */
  showPartRain: z.boolean().optional(),
  /**
   * How the day-summary rain chance is labelled. "percent" is the original
   * bare "2%"; "drop" prefixes a rain-drop pictogram so the number explains
   * itself. Optional for the same reason as showPartRain: absent means the
   * original rendering. New modules start on "drop" (see defaultOptions).
   */
  partRainLabel: z.enum(["percent", "drop"]).optional(),
  lineStyle: textStyleSchema({ size: 15, weight: "bold" }).default({}),
  partStyle: textStyleSchema({ family: "plexmono", size: 13 }).default({}),
  ...staleShape("Prévisions périmées"),
  ...unavailableShape({ title: "Météo indisponible", note: "Aucune valeur inventée" }),
});
export type WeatherCompactOptions = z.infer<typeof WeatherCompactOptions>;

const CONDITION_KEYS: Record<string, PanelStringKey> = {
  sunny: "cond.sunny",
  "clear-night": "cond.clear-night",
  partlycloudy: "cond.partlycloudy",
  cloudy: "cond.cloudy",
  fog: "cond.fog",
  rainy: "cond.rainy",
  snowy: "cond.snowy",
  "lightning-rainy": "cond.lightning-rainy",
};

export function compassFr(deg: number): string {
  return compass(deg, "fr");
}

/** The one-line summary, built from only what the source gave. */
export function weatherLine(value: WeatherValue, options: WeatherCompactOptions, lang?: PanelLang): string {
  const now = value.now ?? { temp: value.slots[0]?.temp ?? value.high, condition: value.condition };
  const parts: string[] = [];
  const key = CONDITION_KEYS[now.condition];
  if (options.showCurrent !== false) parts.push(`${now.temp}° ${key ? pt(lang, key) : ""}`.trim());
  if (options.showFeelsLike && now.apparent !== undefined) parts.push(pt(lang, "weather.feelsLike", { value: now.apparent }));
  if (options.showWind && now.windKmh !== undefined) {
    const dir = now.windDirDeg !== undefined ? ` ${compass(now.windDirDeg, lang)}` : "";
    parts.push(`${pt(lang, "weather.wind", { value: now.windKmh })}${dir}`);
  }
  if (options.showRain && now.precipProb !== undefined) parts.push(pt(lang, "weather.rain", { value: now.precipProb }));
  return parts.join(" · ");
}

export const weatherCompact: ModuleDefinition<WeatherCompactOptions, WeatherValue> = {
  type: "weatherCompact",
  label: "Weather, compact",
  description:
    "Weather on one line (temperature, feels like, wind, rain) or with a morning / noon / evening summary. Only values the source provides are shown.",
  schema: WeatherCompactOptions,
  // New tiles get the self-explaining rain label; stored ones keep theirs.
  defaultOptions: WeatherCompactOptions.parse({ format: "auto", showPartRain: true, partRainLabel: "drop" }),
  defaultSpan: { w: 16, h: 2 },
  minSpan: { w: 8, h: 1 },
  maxSpan: { w: 16, h: 6 },
  sourceBinding: "weather",

  render(fb, rect, data, options, ctx) {
    clearModule(fb, rect);
    const reporter = ctx.report;
    const report = reporter ? { reporter } : {};
    if (data.state === "unavailable" || !data.value) {
      renderUnavailable(fb, rect, options, reporter);
      return;
    }
    const box = inner(rect);
    let y = box.y;
    if (data.state === "stale") {
      y = drawText(fb, box, options.staleLabel, RED, "staleLabel", report).nextY;
    }
    // The line steps down through the type scale until it fits the tile's
    // width (never below 11 px), so a narrow tile still shows the whole line
    // instead of an overflow mark.
    const text = weatherLine(data.value, options, ctx.lang);
    // Every line-1 field switched off: no line, and the day summary moves up
    // into the space rather than leaving a gap.
    if (text.length > 0) {
      const lineBox = { ...box, y, h: box.h - (y - box.y) };
      let style = options.lineStyle;
      for (const size of [...FONT_SIZES].reverse()) {
        if (size > options.lineStyle.size) continue;
        const candidate = { ...options.lineStyle, size };
        style = candidate;
        const laid = layoutText({ text, visible: true, style: candidate }, lineBox, "line");
        if (laid && laid.width <= box.w) break;
      }
      y = drawText(
        fb,
        lineBox,
        { text, visible: true, style },
        BLACK,
        "line",
        report,
      ).nextY;
    }

    const parts = data.value.dayParts ?? [];
    if (resolveWeatherCompactFormat(options.format, rect.h) !== "dayParts" || !options.showDaySummary || parts.length === 0) return;
    const labelH = reservedHeight({ text: "Ag", visible: true, style: options.partStyle });
    if (y + 2 + Math.max(labelH, WEATHER_ICON_H) > box.y + box.h + 2) return;
    const colW = box.w / parts.length;
    parts.forEach((part, i) => {
      const x = box.x + Math.round(i * colW);
      const w = Math.round((i + 1) * colW) - Math.round(i * colW);
      drawWeatherIcon(fb, x, y + 2, part.condition);
      const textX = x + WEATHER_ICON_W + 3;
      const showPartRain = options.showPartRain ?? options.showRain;
      const rainNumber = showPartRain && part.precipProb !== undefined ? `${part.precipProb}%` : "";
      const rainText = rainNumber && options.partRainLabel === "drop" ? `💧${rainNumber}` : rainNumber;
      const tempText = options.showPartTemp ? `${part.temp}°` : "";
      const value = [tempText, rainText].filter((t) => t.length > 0).join(" ");
      drawText(
        fb,
        { x: textX, y: y + 1, w: Math.max(0, x + w - textX), h: labelH },
        { text: localizeDefault(part.label, ctx.lang), visible: true, style: options.partStyle },
        BLACK,
        "partLabel",
        report,
      );
      if (value.length === 0) return;
      drawText(
        fb,
        { x: textX, y: y + 1 + labelH, w: Math.max(0, x + w - textX), h: labelH },
        { text: value, visible: true, style: { ...options.partStyle, weight: "bold" } },
        BLACK,
        "partTemp",
        report,
      );
    });
  },
};
