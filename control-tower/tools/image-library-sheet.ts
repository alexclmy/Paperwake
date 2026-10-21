/**
 * Quality gate for the image library: every picture, every variant, rendered
 * by the REAL panel renderer (renderDashboard over an Image block, exactly as
 * a composition stores it), packed to the device's 2bpp frame, and written as
 * PNG — plus one contact sheet of all of them.
 *
 *     npx tsx tools/image-library-sheet.ts <output-dir>
 *
 * Per picture, two panel frames:
 *   <id>-full.png   the full variant in a 16x12 block
 *   <id>-sizes.png  half (8x6 block), thumb (4x4) and mini (2x2) on one panel
 */
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { pack } from "@/core/frame";
import { PREVIEW_RGB_TRIPLETS } from "@/core/palette";
import { emptyDashboard, type ModuleInstance } from "@/core/model";
import { renderDashboard } from "@/core/render";
import { MODULES } from "@/core/render/modules";
import { cellsToPixels } from "@/core/render/types";
import { framePng } from "@/server/png";
import { LIBRARY, loadLibraryArt } from "@/core/library/catalog";
import { librarySource } from "@/core/library/source";
import { FIXTURE_CTX, noSources } from "../tests/unit/fixtures/render";

const outDir = process.argv[2];
if (!outDir) process.exit(2);
fs.mkdirSync(outDir, { recursive: true });

function imageBlock(id: string, art: Awaited<ReturnType<typeof loadLibraryArt>>, x: number, y: number, w: number, h: number): ModuleInstance {
  const tile = cellsToPixels(x, y, w, h, 0);
  return {
    id: `m${x}${y}`,
    type: "image",
    x,
    y,
    w,
    h,
    hidden: false,
    options: {
      ...(MODULES.image?.defaultOptions as Record<string, unknown>),
      source: librarySource(id, art!, tile.w, tile.h),
    },
  };
}

function writePng(file: string, W: number, H: number, px: Uint8Array): void {
  const chunk = (type: string, data: Buffer): Buffer => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    let c = 0xffffffff;
    for (const b of Buffer.concat([t, data])) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.from([...PREVIEW_RGB_TRIPLETS.flat(), 120, 120, 128, 235, 232, 224]);
  const raw = Buffer.alloc((W + 1) * H);
  for (let y = 0; y < H; y++) Buffer.from(px.buffer, y * W, W).copy(raw, y * (W + 1) + 1);
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("PLTE", plte),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

async function main(): Promise<void> {
  const ctx = FIXTURE_CTX;
  const now = new Date("2026-10-21T08:00:00Z");
  // Contact sheet: one row per picture, full | sizes, at 1x with gutters.
  const G = 12;
  const W = G + (400 + G) * 2;
  const H = G + (300 + G) * LIBRARY.length;
  const sheet = new Uint8Array(W * H).fill(5);
  for (const [row, entry] of LIBRARY.entries()) {
    const art = await loadLibraryArt(entry.id);
    const docs = {
      full: { ...emptyDashboard(entry.name, now), modules: [imageBlock(entry.id, art, 0, 0, 16, 12)] },
      sizes: {
        ...emptyDashboard(entry.name, now),
        modules: [
          imageBlock(entry.id, art, 0, 0, 8, 6),
          imageBlock(entry.id, art, 9, 0, 4, 4),
          imageBlock(entry.id, art, 14, 0, 2, 2),
        ],
      },
    };
    for (const [col, [key, doc]] of Object.entries(docs).entries()) {
      const fb = renderDashboard(doc, noSources(), ctx);
      if (pack(fb).length !== 30000) throw new Error("bad frame");
      fs.writeFileSync(path.join(outDir!, `${entry.id}-${key}.png`), framePng(fb));
      const ox = G + col * (400 + G);
      const oy = G + row * (300 + G);
      for (let y = 0; y < 300; y++)
        for (let x = 0; x < 400; x++) sheet[(oy + y) * W + ox + x] = fb.pixels[y * 400 + x] as number;
    }
  }
  writePng(path.join(outDir!, "contact-sheet.png"), W, H, sheet);
  console.log(`${LIBRARY.length} pictures -> ${outDir}`);
}

void main();
