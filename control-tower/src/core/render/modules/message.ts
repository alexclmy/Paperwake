import { z } from "zod";
import { BLACK, RED } from "@/core/palette";
import { drawText, layoutText, textElementSchema } from "../text";
import { chromeNow, type ModuleDefinition } from "../types";
import { clearModule, inner } from "./common";

/**
 * A short note with an expiry.
 *
 * The note itself is the one module that was always pure user text. What is
 * new is that it now carries typography and wraps: at the old fixed 12 px on
 * one line, a note longer than the tile was cut off without saying so.
 */
export const MessageOptions = z.object({
  body: textElementSchema({
    text: "",
    maxLength: 240,
    style: { size: 15 },
  }).default({}),
  /**
   * ISO 8601 with offset. An expired message disappears from the panel
   * instead of sitting there stale: e-paper holds ink indefinitely, so an
   * undated note outlives its meaning by design.
   */
  expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  /**
   * Where the note sits vertically in its tile. Horizontal alignment is the
   * body's own `style.align` (left, center, right), the same mechanism the
   * headline uses to centre its banner type. "top" is what every note drew
   * before this option existed, so a stored note without the field parses to
   * it and renders byte-identically.
   */
  verticalAlign: z.enum(["top", "middle", "bottom"]).default("top"),
  /** Shown in the attention colour when expiresAt cannot be read as a date. */
  invalidExpiryText: textElementSchema({
    text: "Message : date d'expiration invalide",
    maxLength: 60,
    style: { size: 13 },
  }).default({}),
});
export type MessageOptions = z.infer<typeof MessageOptions>;

export const message: ModuleDefinition<MessageOptions, never> = {
  type: "message",
  label: "Message",
  description:
    "A short note with an expiry. After the expiry the module renders nothing, because frozen ink outlives an undated message.",
  schema: MessageOptions,
  defaultOptions: MessageOptions.parse({}),
  defaultSpan: { w: 12, h: 2 },
  minSpan: { w: 2, h: 1 },
  maxSpan: { w: 16, h: 4 },
  sourceBinding: "none",

  migrateOptions(legacy) {
    return {
      ...(typeof legacy.text === "string" ? { body: { text: legacy.text } } : {}),
      ...(typeof legacy.expiresAt === "string" || legacy.expiresAt === null
        ? { expiresAt: legacy.expiresAt }
        : {}),
    };
  },

  render(fb, rect, _data, options, ctx) {
    clearModule(fb, rect);
    const box = inner(rect);
    const reporter = ctx.report;
    const report = reporter ? { reporter } : {};

    if (options.expiresAt !== null) {
      const expiry = new Date(options.expiresAt);
      if (Number.isNaN(expiry.getTime())) {
        drawText(
          fb,
          box,
          options.invalidExpiryText,
          RED,
          "invalidExpiryText",
          { wrap: true, ...report },
        );
        return;
      }
      // chromeNow so a semantic hash does not depend on when it was taken:
      // whether the note has expired is a fact about the clock, and the dedup
      // gate compares content.
      if (expiry.getTime() <= chromeNow(ctx).getTime()) return;
    }

    // Vertical placement is computed from the same layout drawText will use,
    // so a centred note sits exactly in the middle of what is actually drawn.
    // Top is the historical path and is left untouched.
    let target = box;
    if (options.verticalAlign !== "top") {
      const laid = layoutText(options.body, box, "body", { wrap: true });
      if (laid && laid.visibleLines > 0) {
        const drawnH = (laid.visibleLines - 1) * laid.step + laid.atlas.lineHeight;
        const slack = Math.max(0, box.h - drawnH);
        const offset =
          options.verticalAlign === "middle" ? Math.floor(slack / 2) : slack;
        target = { x: box.x, y: box.y + offset, w: box.w, h: box.h - offset };
      }
    }
    drawText(fb, target, options.body, BLACK, "body", { wrap: true, ...report });
  },
};
