import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLACK, RED, WHITE } from "@/core/palette";
import { countIsolatedAccents, decodeTile } from "@/core/render/imageDither";
import { LIBRARY, LIBRARY_FAMILIES, loadLibraryArt, pickVariant } from "@/core/library/catalog";
import { librarySource } from "@/core/library/source";
import { LIBRARY_THUMBS } from "@/core/library/thumbs.generated";
import { ImageSourceSchema } from "@/core/render/modules/image";
import { SAMPLE_TEMPLATE_KEYS, TEMPLATES } from "@/core/templates";
import { layoutProblems } from "@/core/model";

describe("embedded image library", () => {
  it("has 25 pictures, five per family, each with source SVGs", () => {
    expect(LIBRARY).toHaveLength(25);
    for (const family of LIBRARY_FAMILIES) {
      expect(LIBRARY.filter((e) => e.family === family.key)).toHaveLength(5);
    }
    const dir = path.resolve(__dirname, "../../assets/image-library/svg");
    for (const entry of LIBRARY) {
      expect(fs.existsSync(path.join(dir, `${entry.id}.svg`)), entry.id).toBe(true);
      expect(fs.existsSync(path.join(dir, `${entry.id}.thumb.svg`)), entry.id).toBe(true);
      expect(LIBRARY_THUMBS[entry.id], entry.id).toBeTruthy();
    }
  });

  it("every variant is black/white/red only, with no isolated red pixel", async () => {
    for (const entry of LIBRARY) {
      const art = await loadLibraryArt(entry.id);
      expect(art, entry.id).not.toBeNull();
      for (const tile of Object.values(art!)) {
        const px = decodeTile(tile.data, tile.w, tile.h);
        const used = new Set(px);
        for (const v of used) expect([BLACK, WHITE, RED], entry.id).toContain(v);
        expect(used.has(RED), `${entry.id} uses red`).toBe(true);
        expect(countIsolatedAccents(px, tile.w, tile.h)).toBe(0);
      }
    }
  });

  it("picks the largest variant that fits the block, never scaling", async () => {
    const art = (await loadLibraryArt("coffee"))!;
    expect(pickVariant(art, 400, 300).w).toBe(400);
    expect(pickVariant(art, 400, 225)).toMatchObject({ w: 300, h: 225 });
    expect(pickVariant(art, 200, 150)).toMatchObject({ w: 200, h: 150 });
    expect(pickVariant(art, 100, 300)).toMatchObject({ w: 100, h: 100 });
    expect(pickVariant(art, 150, 100)).toMatchObject({ w: 100, h: 100 });
    expect(pickVariant(art, 50, 50)).toMatchObject({ w: 50, h: 50 });
    expect(pickVariant(art, 20, 20)).toMatchObject({ w: 50, h: 50 });
  });

  it("stores a library pick as a valid image source", async () => {
    const art = (await loadLibraryArt("heart"))!;
    const source = librarySource("heart", art, 200, 150);
    expect(ImageSourceSchema.parse(source)).toEqual(source);
    expect(source.library).toBe("heart");
  });

  it("offers the five library starter templates with valid layouts", () => {
    for (const key of ["welcome", "goodMorning", "goodNight", "birthday", "doNotDisturb"]) {
      const t = TEMPLATES.find((x) => x.key === key);
      expect(t, key).toBeDefined();
      expect(layoutProblems(t!.build(new Date("2026-10-21T08:00:00Z")))).toEqual([]);
    }
  });
});

describe("library variant follows the block size at render time", () => {
  it("resizing a block to the full grid draws the 400x300 variant without a re-pick", async () => {
    const { renderDashboard, PANEL_TIMEZONE } = await import("@/core/render");
    const { registerLibraryArt } = await import("@/core/library/registry");
    const { FrameBuffer } = await import("@/core/frame");
    const art = (await loadLibraryArt("cat"))!;
    registerLibraryArt("cat", art);
    const welcome = TEMPLATES.find((t) => t.key === "welcome")!.build(new Date("2026-10-21T08:00:00Z"));
    const small = librarySource("cat", art, 150, 150);
    expect(small.tileW).toBe(100);
    const doc = {
      ...welcome,
      theme: { ...welcome.theme, contentPadding: 0 },
      modules: [
        { id: "img", type: "image", x: 0, y: 0, w: 16, h: 12, hidden: false, options: { source: small } },
      ],
    } as typeof welcome;
    const fb = renderDashboard(doc, {} as never, { now: new Date("2026-10-21T08:00:00Z"), timeZone: PANEL_TIMEZONE });
    const expected = new FrameBuffer();
    const tile = decodeTile(art.full.data, 400, 300);
    for (let i = 0; i < tile.length; i += 1) expected.pixels[i] = tile[i]!;
    expect(Buffer.from(fb.pixels).equals(Buffer.from(expected.pixels))).toBe(true);
  });
});

describe("default sample boards", () => {
  it("seeds only Welcome to NOTE4C and Birthday; the others stay templates", () => {
    expect([...SAMPLE_TEMPLATE_KEYS]).toEqual(["welcome", "birthday"]);
    const names = SAMPLE_TEMPLATE_KEYS.map((k) => TEMPLATES.find((t) => t.key === k)!.name);
    expect(names).toEqual(["Welcome to NOTE4C", "Birthday"]);
    for (const key of ["goodMorning", "goodNight", "doNotDisturb"]) {
      expect(TEMPLATES.some((t) => t.key === key), key).toBe(true);
    }
  });
});
