import { z } from "zod";
import { BLACK, RED, type PaletteIndex } from "@/core/palette";
import type { SensorValue } from "../data";
import { drawText, layoutText, reservedHeight, textStyleSchema } from "../text";
import { FONT_SIZES } from "@/core/font";
import { ADVANCED_OPTION_TAG, LAYOUT_VARIANT_TAG, type ModuleData, type ModuleDefinition, type PixelRect } from "../types";
import { clearModule, inner } from "./common";

/**
 * Home sensors: several read-only Home Assistant readings in one tile.
 *
 * The entities are picked in the inspector from the tower's own list of
 * sensor.* entities (temperature and humidity first); each gets an optional
 * label of its own. Three formats: rows, one compact line, or a tile grid.
 *
 * Every entity carries its own state. A reading older than the freshness
 * window is drawn in red with the stale marker; an entity Home Assistant does
 * not answer for is drawn as the unavailable word in red. Nothing is ever
 * shown as zero or a dash. New module: no stored composition is affected.
 */
export const HOME_SENSORS_VARIANTS = ["auto", "list", "compact", "tiles"] as const;

/**
 * "auto": one line on a tile too short for a list, a list when every row has
 * room, tiles on a wide-and-short tile that can lay readings side by side.
 */
export function resolveHomeSensorsFormat(
  format: (typeof HOME_SENSORS_VARIANTS)[number],
  rect: { w: number; h: number },
  count: number,
): "list" | "compact" | "tiles" {
  if (format !== "auto") return format;
  if (rect.h < 50) return "compact";
  const rowPx = 22;
  if (count * rowPx + 8 <= rect.h) return "list";
  return "tiles";
}
export const HOME_SENSORS_TAG = "home-sensor-entities";
export const MAX_HOME_SENSORS = 8;

export const HomeSensorEntity = z.object({
  entityId: z
    .string()
    .regex(/^sensor\.[a-z0-9_]+$/, "Only sensor. entities can be displayed"),
  /** Panel label. Empty means "use Home Assistant's name". */
  label: z.string().max(24).default(""),
  /** Home Assistant's friendly name when it was picked, for the empty-label case. */
  name: z.string().max(60).default(""),
});
export type HomeSensorEntity = z.infer<typeof HomeSensorEntity>;

export const HomeSensorsOptions = z.object({
  format: z.enum(HOME_SENSORS_VARIANTS).default("list").describe(LAYOUT_VARIANT_TAG),
  entities: z.array(HomeSensorEntity).max(MAX_HOME_SENSORS).default([]).describe(HOME_SENSORS_TAG),
  labelStyle: textStyleSchema({ size: 13 }).default({}),
  valueStyle: textStyleSchema({ family: "plexmono", size: 15, weight: "bold" }).default({}),
  staleMarker: z.string().max(12).default("périmé").describe(ADVANCED_OPTION_TAG),
  unavailableWord: z.string().max(20).default("indisponible").describe(ADVANCED_OPTION_TAG),
  emptyText: z.string().max(40).default("Aucun capteur choisi").describe(ADVANCED_OPTION_TAG),
});
export type HomeSensorsOptions = z.infer<typeof HomeSensorsOptions>;

/** What the renderer receives: one reading per configured entity, in order. */
export interface HomeSensorsValue {
  readings: Record<string, ModuleData<SensorValue>>;
}

/** Shown label: the owner's, else HA's name, else the entity id. */
export function labelFor(entity: HomeSensorEntity): string {
  return entity.label.trim() || entity.name.trim() || entity.entityId;
}

interface Row {
  label: string;
  value: string;
  colour: PaletteIndex;
}

export function homeSensorRows(
  options: HomeSensorsOptions,
  readings: Record<string, ModuleData<SensorValue>>,
): Row[] {
  return options.entities.map((entity) => {
    const data = readings[entity.entityId];
    const label = labelFor(entity);
    if (!data || data.state === "unavailable" || !data.value) {
      return { label, value: options.unavailableWord, colour: RED };
    }
    if (data.state === "stale") {
      const marker = options.staleMarker.trim();
      return { label, value: marker ? `${data.value.value} ${marker}` : data.value.value, colour: RED };
    }
    return { label, value: data.value.value, colour: BLACK };
  });
}

function fitSize(text: string, style: HomeSensorsOptions["valueStyle"], box: PixelRect, role: string) {
  let chosen = style;
  for (const size of [...FONT_SIZES].reverse()) {
    if (size > style.size) continue;
    chosen = { ...style, size };
    const laid = layoutText({ text, visible: true, style: chosen }, box, role);
    if (laid && laid.width <= box.w) break;
  }
  return chosen;
}

export const homeSensors: ModuleDefinition<HomeSensorsOptions, HomeSensorsValue> = {
  type: "homeSensors",
  label: "Home sensors",
  description:
    "Read-only Home Assistant readings (temperature, humidity, any numeric sensor) as rows, one line, or tiles. Old readings are marked, missing ones say so.",
  schema: HomeSensorsOptions,
  defaultOptions: HomeSensorsOptions.parse({ format: "auto" }),
  defaultSpan: { w: 8, h: 4 },
  minSpan: { w: 4, h: 1 },
  maxSpan: { w: 16, h: 8 },
  sourceBinding: "homeSensors",

  render(fb, rect, data, options, ctx) {
    clearModule(fb, rect);
    const box = inner(rect);
    const reporter = ctx.report;
    const report = reporter ? { reporter } : {};
    if (options.entities.length === 0) {
      drawText(fb, box, { text: options.emptyText, visible: true, style: options.labelStyle }, BLACK, "emptyText", report);
      return;
    }
    const rows = homeSensorRows(options, data.value?.readings ?? {});
    const format = resolveHomeSensorsFormat(options.format, rect, rows.length);

    if (format === "compact") {
      const text = rows.map((r) => `${r.label} ${r.value}`).join(" · ");
      const anyRed = rows.some((r) => r.colour === RED);
      const style = fitSize(text, options.valueStyle, box, "line");
      // One line, one colour: red as soon as any reading is untrustworthy.
      drawText(fb, box, { text, visible: true, style }, anyRed ? RED : BLACK, "line", report);
      return;
    }

    if (format === "tiles") {
      const n = rows.length;
      const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4;
      const rowsCount = Math.ceil(n / cols);
      const cellW = Math.floor(box.w / cols);
      const cellH = Math.floor(box.h / rowsCount);
      const labelH = reservedHeight({ text: "Ag", visible: true, style: options.labelStyle });
      rows.forEach((row, i) => {
        const cx = box.x + (i % cols) * cellW;
        const cy = box.y + Math.floor(i / cols) * cellH;
        const cell = { x: cx + 1, y: cy, w: cellW - 3, h: cellH };
        drawText(fb, cell, { text: row.label, visible: true, style: options.labelStyle }, BLACK, "label", report);
        const valueBox = { ...cell, y: cy + labelH, h: Math.max(0, cellH - labelH) };
        const style = fitSize(row.value, options.valueStyle, valueBox, "value");
        drawText(fb, valueBox, { text: row.value, visible: true, style }, row.colour, "value", report);
        if (i % cols < cols - 1 && cellW > 8) {
          fb.fillRect(cx + cellW - 1, cy + 1, 1, Math.max(0, cellH - 4), BLACK);
        }
      });
      return;
    }

    // list: label left, value right, one row each.
    const rowH = Math.max(
      reservedHeight({ text: "Ag", visible: true, style: options.labelStyle }),
      reservedHeight({ text: "Ag", visible: true, style: options.valueStyle }),
    );
    let y = box.y;
    for (const row of rows) {
      if (y + rowH > box.y + box.h + 1) break;
      const line = { x: box.x, y, w: box.w, h: rowH };
      const valueStyle = { ...options.valueStyle, align: "right" as const };
      const laidValue = layoutText({ text: row.value, visible: true, style: valueStyle }, line, "value");
      const valueW = laidValue ? laidValue.width : 0;
      drawText(
        fb,
        { ...line, w: Math.max(0, box.w - valueW - 6) },
        { text: row.label, visible: true, style: options.labelStyle },
        BLACK,
        "label",
        report,
      );
      drawText(fb, line, { text: row.value, visible: true, style: valueStyle }, row.colour, "value", report);
      y += rowH;
    }
  },
};
