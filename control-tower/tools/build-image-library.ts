/**
 * Build the embedded image library from its SVG sources.
 *
 *     npx tsx tools/build-image-library.ts [--check]
 *
 * Reads assets/image-library/svg/*.svg (the hand-authored, CC0 sources) and
 * writes src/core/library/art/<id>.ts — one file per picture, each variant a
 * separate named export so a caller that needs one size bundles one size —
 * plus src/core/library/thumbs.generated.ts with every thumbnail for the
 * picker grid.
 *
 * INK CODES
 * ---------
 * The panel has three pigments here: black, white, red. There is no grey, so
 * shading is drawn as pattern, and the pattern is laid down in DEVICE pixels
 * after rasterising — never scaled with the drawing, which is what would turn
 * a 1 px engraving line into mush at half size. The SVG says WHICH texture and
 * HOW DENSE with a reserved colour; this script substitutes the pattern:
 *
 *   #000000                black ink
 *   #ffffff                paper
 *   #ff0000                red ink
 *   grey  rgb(v,v,v)       diagonal engraving hatch, density 1 - v/255
 *                          (past ~70 % it cross-hatches)
 *   green rgb(0,v,0)       horizontal engraving lines (skies, water)
 *   blue  rgb(0,0,v)       stipple (ordered dots)
 *   pink  rgb(255,v,v)     red diagonal hatch on paper
 *   rgb(128,0,0)           red/black cross-hatch (deep red shadow)
 *
 * Anti-aliasing is switched off so every pixel carries exactly one authored
 * colour; anything else is reported as an error, so a stray colour in a source
 * cannot quietly become a smudge. Isolated red pixels are scrubbed with the
 * same rule the upload path uses (the panel cannot render a lone red speck).
 *
 * VARIANTS
 * --------
 *   full   400x300  from <id>.svg
 *   large  300x225  from <id>.svg
 *   half   200x150  from <id>.svg
 *   thumb  100x100  from <id>.thumb.svg (a simplified, square drawing)
 *   mini    50x50   from <id>.thumb.svg
 */

import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  countIsolatedAccents,
  encodeTile,
  scrubIsolatedAccents,
} from "@/core/render/imageDither";
import { BLACK, RED, WHITE } from "@/core/palette";

const ROOT = path.resolve(__dirname, "..");
const SVG_DIR = path.join(ROOT, "assets/image-library/svg");
const OUT_DIR = path.join(ROOT, "src/core/library/art");
const THUMBS_OUT = path.join(ROOT, "src/core/library/thumbs.generated.ts");

export const VARIANTS = [
  { key: "full", w: 400, h: 300, src: "main" },
  { key: "large", w: 300, h: 225, src: "main" },
  { key: "half", w: 200, h: 150, src: "main" },
  { key: "thumb", w: 100, h: 100, src: "thumb" },
  { key: "mini", w: 50, h: 50, src: "thumb" },
] as const;

const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/** Diagonal engraving hatch. t is ink coverage, 0..1. */
function hatch(x: number, y: number, t: number): boolean {
  const d = x + y;
  if (t < 0.14) return d % 7 === 0;
  if (t < 0.24) return d % 5 === 0;
  if (t < 0.36) return d % 4 === 0;
  if (t < 0.48) return d % 3 === 0;
  if (t < 0.6) return d % 4 < 2;
  const a = x - y + 3000;
  if (t < 0.72) return d % 3 === 0 || a % 3 === 0;
  if (t < 0.86) return d % 2 === 0 || a % 3 === 0;
  return !(d % 4 === 0 && a % 4 === 0);
}

/** Horizontal engraving lines. */
function lines(x: number, y: number, t: number): boolean {
  void x;
  if (t < 0.2) return y % 6 === 0;
  if (t < 0.35) return y % 4 === 0;
  if (t < 0.5) return y % 3 === 0;
  if (t < 0.7) return y % 2 === 0;
  return y % 3 !== 2;
}

/** Ordered stipple. */
function stipple(x: number, y: number, t: number): boolean {
  return (BAYER8[y & 7]![x & 7] as number) < t * 64;
}

export function classify(
  r: number,
  g: number,
  b: number,
  x: number,
  y: number,
): number | null {
  if (r === 0 && g === 0 && b === 0) return BLACK;
  if (r === 255 && g === 255 && b === 255) return WHITE;
  if (r === 255 && g === 0 && b === 0) return RED;
  if (r === g && g === b) return hatch(x, y, 1 - r / 255) ? BLACK : WHITE;
  if (r === 0 && b === 0) return lines(x, y, 1 - g / 255) ? BLACK : WHITE;
  if (r === 0 && g === 0) return stipple(x, y, 1 - b / 255) ? BLACK : WHITE;
  if (r === 255 && g === b) return hatch(x, y, 1 - g / 255) ? RED : WHITE;
  if (r === 128 && g === 0 && b === 0) {
    return (x + y) % 2 === 0 ? RED : BLACK;
  }
  return null;
}

export function rasterise(
  svg: string,
  w: number,
  h: number,
): { indices: Uint8Array; stray: number } {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: w },
    shapeRendering: 0,
    textRendering: 0,
    imageRendering: 1,
    background: "#ffffff",
    font: { loadSystemFonts: false },
  });
  const img = resvg.render();
  if (img.width !== w || img.height !== h) {
    throw new Error(`rendered ${img.width}x${img.height}, wanted ${w}x${h}`);
  }
  const px = img.pixels;
  const out = new Uint8Array(w * h);
  let stray = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = (px[i + 3] as number) / 255;
      // Background is opaque white, so alpha is 1; composite defensively.
      const r = Math.round((px[i] as number) * a + 255 * (1 - a));
      const g = Math.round((px[i + 1] as number) * a + 255 * (1 - a));
      const b = Math.round((px[i + 2] as number) * a + 255 * (1 - a));
      const c = classify(r, g, b, x, y);
      if (c === null) {
        stray += 1;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        out[y * w + x] = r > 180 && g < 90 ? RED : l < 128 ? BLACK : WHITE;
      } else {
        out[y * w + x] = c;
      }
    }
  }
  scrubIsolatedAccents(out, w, h);
  return { indices: out, stray };
}

function main(): void {
  const check = process.argv.includes("--check");
  const files = fs
    .readdirSync(SVG_DIR)
    .filter((f) => f.endsWith(".svg") && !f.endsWith(".thumb.svg"))
    .sort();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const thumbs: string[] = [];
  let failed = false;
  let bytes = 0;
  for (const file of files) {
    const id = file.replace(/\.svg$/, "");
    const main = fs.readFileSync(path.join(SVG_DIR, file), "utf8");
    const thumbPath = path.join(SVG_DIR, `${id}.thumb.svg`);
    if (!fs.existsSync(thumbPath)) {
      console.error(`${id}: missing ${id}.thumb.svg`);
      failed = true;
      continue;
    }
    const thumb = fs.readFileSync(thumbPath, "utf8");
    const lines: string[] = [
      "// GENERATED by tools/build-image-library.ts from",
      `// assets/image-library/svg/${id}.svg (CC0). Do not edit by hand.`,
      "",
    ];
    for (const v of VARIANTS) {
      const { indices, stray } = rasterise(v.src === "main" ? main : thumb, v.w, v.h);
      if (stray > 0) {
        console.error(`${id}/${v.key}: ${stray} pixels outside the ink codes`);
        failed = true;
      }
      if (countIsolatedAccents(indices, v.w, v.h) !== 0) failed = true;
      const data = encodeTile(indices, v.w, v.h);
      lines.push(
        `export const ${v.key} = { w: ${v.w}, h: ${v.h}, data: ${JSON.stringify(data)} };`,
      );
      if (v.key === "thumb") {
        thumbs.push(`  ${JSON.stringify(id)}: ${JSON.stringify(data)},`);
      }
    }
    const text = `${lines.join("\n")}\n`;
    bytes += text.length;
    const target = path.join(OUT_DIR, `${id}.ts`);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== text) {
        console.error(`${id}: generated file is stale; run the build`);
        failed = true;
      }
    } else {
      fs.writeFileSync(target, text);
    }
  }
  const thumbText = [
    "// GENERATED by tools/build-image-library.ts. Do not edit by hand.",
    "// Every library thumbnail (100x100, 2bpp base64), for the picker grid.",
    "",
    "export const LIBRARY_THUMBS: Record<string, string> = {",
    ...thumbs,
    "};",
    "",
  ].join("\n");
  bytes += thumbText.length;
  if (check) {
    if (!fs.existsSync(THUMBS_OUT) || fs.readFileSync(THUMBS_OUT, "utf8") !== thumbText) {
      console.error("thumbs.generated.ts is stale");
      failed = true;
    }
  } else {
    fs.writeFileSync(THUMBS_OUT, thumbText);
  }
  console.log(`${files.length} pictures, ${(bytes / 1024).toFixed(0)} KiB generated`);
  if (failed) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("build-image-library.ts")) main();
