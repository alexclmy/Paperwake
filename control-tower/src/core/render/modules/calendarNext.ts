import { z } from "zod";
import { BLACK, RED } from "@/core/palette";
import type { CalendarValue } from "../data";
import {
  drawText,
  layoutText,
  reservedHeight,
  textElementSchema,
  textStyleSchema,
} from "../text";
import { LAYOUT_VARIANT_TAG, type ModuleDefinition } from "../types";
import {
  clearModule,
  inner,
  renderUnavailable,
  staleShape,
  unavailableShape,
} from "./common";
import { formatPanelDate, formatPanelTime, pt, type PanelLang } from "../i18n";

/**
 * The "when" line in the panel language. The snapshot pre-formats it in
 * French ("12/09 08:30", "12/09 · journée"); French renders it exactly as
 * stored, English re-derives it from the event's own start instant.
 */
export function eventWhen(
  event: { when: string; start: string },
  timeZone: string,
  lang?: PanelLang,
): string {
  if (lang !== "en") return event.when;
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return event.when;
  const allDay = /·\s*journée$/.test(event.when);
  if (allDay) {
    // All-day starts are midnight local, written as a date; read the date the
    // snapshot already chose (dd/mm) so a zone offset cannot shift the day.
    const m = /^(\d{2})\/(\d{2})/.exec(event.when);
    const day = m ? new Date(Date.UTC(start.getUTCFullYear(), Number(m[2]) - 1, Number(m[1]), 12)) : start;
    return `${formatPanelDate(day, m ? "UTC" : timeZone, lang)} · ${pt(lang, "calendar.allDay")}`;
  }
  return `${formatPanelDate(start, timeZone, lang)} ${formatPanelTime(start, timeZone)}`;
}

/**
 * The next few calendar events.
 *
 * Every fixed string this module used to draw — the heading, "Aucun
 * événement", "sur les 366 prochains jours", "Instantané périmé" — is now a
 * text element the owner can reword, restyle, or switch off. The event titles and
 * times stay data-bound: they are the calendar's to state, not the panel's.
 */
export const CALENDAR_VARIANTS = ["auto", "list", "oneLine", "twoLines"] as const;

/**
 * "auto" picks the disposition the tile's height can hold: a single line with
 * no heading on a one-row tile, two compact lines up to four rows, the block
 * list above that. Only new tiles start on auto; a stored composition keeps
 * its explicit variant and renders exactly as before.
 */
export function resolveCalendarVariant(
  variant: (typeof CALENDAR_VARIANTS)[number],
  heightPx: number,
): { variant: "list" | "oneLine" | "twoLines"; heading: boolean } {
  if (variant !== "auto") return { variant, heading: true };
  if (heightPx < 50) return { variant: "oneLine", heading: false };
  if (heightPx < 100) return { variant: "twoLines", heading: heightPx >= 75 };
  return { variant: "list", heading: true };
}
/** The wording the module shipped with, which named a horizon it never had. */
export const LEGACY_EMPTY_NOTE = "sur les 366 prochains jours";
export const HORIZON_PLACEHOLDER = "{jours}";

/** The empty-state note made truthful: the real horizon, or none at all. */
export function emptyNoteText(text: string, horizonDays: number | undefined, lang?: PanelLang): string {
  const legacy = text === LEGACY_EMPTY_NOTE || text === pt(lang, "calendar.emptyNoteLegacy");
  const template = legacy ? pt(lang, "calendar.emptyNote") : text;
  if (!template.includes(HORIZON_PLACEHOLDER)) return template;
  if (horizonDays === undefined) return pt(lang, "calendar.noHorizon");
  return template.split(HORIZON_PLACEHOLDER).join(String(horizonDays));
}

export const CalendarNextOptions = z.object({
  /**
   * "list" is the historical block (when line above a wrapped title) and the
   * default, so stored compositions render exactly as before. "oneLine" is
   * the next event on a single line; "twoLines" the next two, one per line.
   */
  variant: z.enum(CALENDAR_VARIANTS).default("list").describe(LAYOUT_VARIANT_TAG),
  heading: textElementSchema({
    text: "À VENIR",
    maxLength: 40,
    style: { size: 15, weight: "bold" },
  }).default({}),
  maxEvents: z.number().int().min(1).max(4).default(2),
  /** The "11/09 09:00" line above each title. */
  whenStyle: textStyleSchema({ family: "plexmono", size: 13 }).default({}),
  /** The event title itself. */
  titleStyle: textStyleSchema({ size: 15 }).default({}),
  emptyTitle: textElementSchema({
    text: "Aucun événement",
    maxLength: 60,
    style: { size: 15 },
  }).default({}),
  emptyNote: textElementSchema({
    text: `sur les ${HORIZON_PLACEHOLDER} prochains jours`,
    maxLength: 60,
    style: { size: 13 },
  }).default({}),
  ...staleShape("Instantané périmé"),
  ...unavailableShape({
    title: "Calendrier indisponible",
    note: "Accès EventKit à vérifier",
  }),
});
export type CalendarNextOptions = z.infer<typeof CalendarNextOptions>;

export const calendarNext: ModuleDefinition<
  CalendarNextOptions,
  CalendarValue
> = {
  type: "calendarNext",
  label: "Calendar, next events",
  description:
    "Upcoming events from the configured calendar snapshot. Titles and times only: no locations, no attendees, no notes leave the Mac.",
  schema: CalendarNextOptions,
  // New tiles adapt to their size; stored ones keep their explicit variant.
  defaultOptions: CalendarNextOptions.parse({ variant: "auto" }),
  defaultSpan: { w: 10, h: 4 },
  minSpan: { w: 6, h: 1 },
  maxSpan: { w: 16, h: 8 },
  sourceBinding: "calendar",

  migrateOptions(legacy) {
    return {
      ...(typeof legacy.heading === "string"
        ? { heading: { text: legacy.heading } }
        : {}),
      ...(typeof legacy.maxEvents === "number"
        ? { maxEvents: legacy.maxEvents }
        : {}),
    };
  },

  render(fb, rect, data, options, ctx) {
    clearModule(fb, rect);
    const box = inner(rect);
    const reporter = ctx.report;
    const report = reporter ? { reporter } : {};

    if (data.state === "unavailable" || !data.value) {
      renderUnavailable(fb, rect, options, reporter);
      return;
    }

    const resolved = resolveCalendarVariant(options.variant, rect.h);
    let y = resolved.heading
      ? drawText(fb, box, options.heading, BLACK, "heading", report).nextY
      : box.y;
    const below = (): { x: number; y: number; w: number; h: number } => ({
      x: box.x,
      y,
      w: box.w,
      h: box.h - (y - box.y),
    });

    if (data.state === "stale") {
      y = drawText(fb, below(), options.staleLabel, RED, "staleLabel", report)
        .nextY;
    }

    const events = data.value.events.slice(0, options.maxEvents);

    if (events.length === 0) {
      y = drawText(fb, below(), options.emptyTitle, BLACK, "emptyTitle", report)
        .nextY;
      drawText(
        fb,
        below(),
        { ...options.emptyNote, text: emptyNoteText(options.emptyNote.text, data.value.horizonDays, ctx.lang) },
        BLACK,
        "emptyNote",
        report,
      );
      return;
    }

    if (resolved.variant !== "list") {
      // Compact: "11/09 09:00  Titre" per line, never wrapped. The time is red
      // as in the block layout; the title takes whatever width is left.
      const count = resolved.variant === "oneLine" ? 1 : Math.min(2, events.length);
      const lineH = Math.max(
        reservedHeight({ text: "00", visible: true, style: options.whenStyle }),
        reservedHeight({ text: "Ag", visible: true, style: options.titleStyle }),
      );
      for (const event of events.slice(0, count)) {
        if (y + lineH > box.y + box.h + 4) break;
        const whenEl = { text: eventWhen(event, ctx.timeZone, ctx.lang), visible: true, style: options.whenStyle };
        drawText(fb, { x: box.x, y, w: box.w, h: lineH }, whenEl, RED, "eventWhen", report);
        const whenW = layoutText(whenEl, { x: box.x, y, w: box.w, h: lineH }, "eventWhen")?.width ?? 0;
        const gap = Math.min(box.w, whenW + 6);
        drawText(
          fb,
          { x: box.x + gap, y, w: Math.max(0, box.w - gap), h: lineH },
          { text: event.title, visible: true, style: options.titleStyle },
          BLACK,
          "eventTitle",
          report,
        );
        y += lineH + 2;
      }
      return;
    }

    // Each event needs a when line plus a title, and both heights follow
    // whatever typography the user chose, so a bigger title does not silently
    // collide with the event under it.
    //
    // Titles wrap to at most two lines and the row advances by however many
    // lines were actually drawn. Real calendar entries are long — a title of
    // forty-odd characters does not fit 250 px on one line at 15 px — and
    // wrapping uses the vertical room the tile already has instead of spending
    // an overflow warning on an ordinary appointment.
    const whenHeight = reservedHeight({
      text: "00/00 00:00",
      visible: true,
      style: options.whenStyle,
    });
    const titleHeight = reservedHeight({
      text: "Ag",
      visible: true,
      style: options.titleStyle,
    });

    for (const event of events) {
      // A row that could not show its when line and at least one title line is
      // not started: half an event on frozen ink reads as a different event.
      if (y + whenHeight + titleHeight > box.y + box.h + 6) {
        if (reporter) {
          reporter.overflow({
            role: "events",
            text: `${events.length} événements demandés`,
            kind: "height",
            neededPx: y + whenHeight + titleHeight - box.y,
            availablePx: box.h,
          });
        }
        break;
      }
      // The event's own words, passed through as data. Deliberately NOT run
      // through fillTemplate: a calendar entry called "Réunion {budget}" is a
      // string from the user's calendar, not a template for this module to
      // interpret.
      drawText(
        fb,
        { x: box.x, y, w: box.w, h: whenHeight },
        { text: eventWhen(event, ctx.timeZone, ctx.lang), visible: true, style: options.whenStyle },
        RED,
        "eventWhen",
        report,
      );
      const title = drawText(
        fb,
        {
          x: box.x,
          y: y + whenHeight,
          w: box.w,
          h: Math.max(0, box.y + box.h - (y + whenHeight)),
        },
        { text: event.title, visible: true, style: options.titleStyle },
        BLACK,
        "eventTitle",
        { wrap: true, maxLines: 2, ...report },
      );
      y = title.nextY + 4;
    }
  },
};
