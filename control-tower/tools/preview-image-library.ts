/**
 * Draft-time preview of library SVGs, straight through the build's rasteriser.
 *
 *     npx tsx tools/preview-image-library.ts <out.png> <id> [id...]
 *
 * One row per picture: full | half | thumb | mini, each at 2x so ink detail is
 * visible on a monitor. For authoring only; the quality gate uses the panel
 * renderer (tools/image-library-sheet.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { rasterise, VARIANTS } from "./build-image-library";
import { PREVIEW_RGB_TRIPLETS } from "@/core/palette";

const [out, ...ids] = process.argv.slice(2);
if (!out || ids.length === 0) process.exit(2);
const SVG_DIR = path.resolve(__dirname, "../assets/image-library/svg");
const S = 2;
const show = VARIANTS.filter((v) => v.key !== "large");
const rowW = show.reduce((a, v) => a + v.w * S + 10, 10);
const rowH = 300 * S + 10;
const W = rowW;
const H = rowH * ids.length + 10;
const buf = new Uint8Array(W * H).fill(4); // 4 = frame grey
for (const [r, id] of ids.entries()) {
  let ox = 10;
  for (const v of show) {
    const file = path.join(SVG_DIR, v.src === "main" ? `${id}.svg` : `${id}.thumb.svg`);
    const { indices, stray } = rasterise(fs.readFileSync(file, "utf8"), v.w, v.h);
    if (stray) console.log(`${id}/${v.key} stray ${stray}`);
    for (let y = 0; y < v.h * S; y += 1)
      for (let x = 0; x < v.w * S; x += 1)
        buf[(10 + r * rowH + y) * W + ox + x] = indices[((y / S) | 0) * v.w + ((x / S) | 0)] as number;
    ox += v.w * S + 10;
  }
}
function chunk(type: string, data: Buffer): Buffer {
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
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 3;
const plte = Buffer.from([...PREVIEW_RGB_TRIPLETS.flat(), 150, 150, 160]);
const raw = Buffer.alloc((W + 1) * H);
for (let y = 0; y < H; y++) Buffer.from(buf.buffer, y * W, W).copy(raw, y * (W + 1) + 1);
fs.writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log(out);
