import { FrameBuffer } from "@/core/frame";
import { BLACK, RED, WHITE, YELLOW, type PaletteIndex } from "@/core/palette";
import type { ColourUse } from "@/core/theme";
import type { MoonPhase } from "./astronomy";
import { ditherRect, fillBandDither, fillDiscDither, type DitherStyle } from "./dither";
import { arc, ellipseInclusive, thickLine } from "./draw";
import type { PixelRect } from "./types";

/**
 * Weather scenes — the illustrated skies behind the Weather hero.
 *
 * One scene per family of condition (clear, a few clouds, overcast, rain,
 * a downpour, a storm, snow, sleet, hail, fog, wind), each drawable by day or
 * by night. They are built from the same risograph vocabulary as the rest of
 * the board — a graded halftone field, flat discs, 2 px ink outlines — so a
 * rainy night and a sunny noon read as two prints of the same poster series.
 *
 * Everything is pure geometry over the rect: no clock, no randomness. The moon
 * takes its phase from the caller (who computes it from the render instant),
 * so the preview and the packed bytes agree to the pixel.
 *
 * COLOUR follows the Expression stance. Black & white draws every warm body as
 * paper with an ink rim; Balanced keeps the sun yellow; Expressive turns it
 * red. Yellow is never laid thinner than a 2 px block, and the module scrubs
 * the frame once at the end for any sliver an outline cut.
 */

export const WEATHER_SCENES = [
  "clear",
  "partly",
  "cloudy",
  "rain",
  "pouring",
  "storm",
  "snow",
  "sleet",
  "hail",
  "fog",
  "wind",
] as const;
export type WeatherScene = (typeof WEATHER_SCENES)[number];

/** The scene a Home-Assistant-style condition code calls for, or null when unknown. */
export function sceneForCondition(code: string): WeatherScene | null {
  switch (code) {
    case "sunny":
    case "clear-night":
      return "clear";
    case "partlycloudy":
      return "partly";
    case "cloudy":
      return "cloudy";
    case "rainy":
      return "rain";
    case "pouring":
      return "pouring";
    case "lightning":
    case "lightning-rainy":
      return "storm";
    case "snowy":
      return "snow";
    case "snowy-rainy":
      return "sleet";
    case "hail":
      return "hail";
    case "fog":
      return "fog";
    case "windy":
    case "windy-variant":
      return "wind";
    default:
      return null;
  }
}

export interface SceneSpec {
  /** Null draws a neutral field and no picture: an unknown condition is not guessed. */
  scene: WeatherScene | null;
  night: boolean;
  colourUse: ColourUse;
  style: DitherStyle;
  moon: MoonPhase;
}

export interface SceneResult {
  /** The pigment of the graded sky, so the caller can decide how to set type on it. */
  fieldPigment: PaletteIndex;
}

/** The anchor every scene hangs its main body on — the same spot the sun has always had. */
interface Anchor {
  cx: number;
  cy: number;
  r: number;
}

function anchorFor(rect: PixelRect): Anchor {
  const r = Math.max(9, Math.min(Math.round(rect.h * 0.22), 30));
  return {
    cx: rect.x + rect.w - r - Math.round(rect.w * 0.06),
    cy: rect.y + r + Math.round(rect.h * 0.1),
    r,
  };
}

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

type Inside = (x: number, y: number) => boolean;

/**
 * Paint a solid shape pixel by pixel: `fill` inside, and an `outline` ring of
 * `ring` px along the inner edge. A null fill keeps what is underneath (an
 * outline-only shape); a null outline skips the ring.
 */
function paintShape(
  fb: FrameBuffer,
  bounds: PixelRect,
  inside: Inside,
  fill: PaletteIndex | null,
  outline: PaletteIndex | null,
  ring = 2,
): void {
  const x0 = Math.floor(bounds.x);
  const y0 = Math.floor(bounds.y);
  const x1 = Math.ceil(bounds.x + bounds.w);
  const y1 = Math.ceil(bounds.y + bounds.h);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!inside(x, y)) continue;
      let edge = false;
      if (outline !== null) {
        for (let dy = -ring; dy <= ring && !edge; dy += 1) {
          for (let dx = -ring; dx <= ring; dx += 1) {
            if (dx * dx + dy * dy > ring * ring) continue;
            if (!inside(x + dx, y + dy)) {
              edge = true;
              break;
            }
          }
        }
      }
      if (edge) fb.set(x, y, outline as PaletteIndex);
      else if (fill !== null) fb.set(x, y, fill);
    }
  }
}

function inDisc(x: number, y: number, cx: number, cy: number, r: number): boolean {
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

/**
 * The cloud silhouette: three bumps over a flat base, `s` being its half-width.
 * Unit geometry, so every cloud in the series is the same cloud at a new size.
 */
function cloudInside(cx: number, cy: number, s: number): Inside {
  const bumps: Array<[number, number, number]> = [
    [-0.52, 0.12, 0.34],
    [-0.1, -0.12, 0.46],
    [0.42, 0.05, 0.38],
  ];
  const base = { x0: cx - 0.52 * s, x1: cx + 0.42 * s, y0: cy + 0.12 * s, y1: cy + 0.46 * s };
  const floor = cy + 0.46 * s;
  return (x, y) => {
    if (y > floor) return false;
    if (x >= base.x0 && x <= base.x1 && y >= base.y0) return true;
    return bumps.some(([bx, by, br]) => inDisc(x, y, cx + bx * s, cy + by * s, br * s));
  };
}

function cloudBounds(cx: number, cy: number, s: number): PixelRect {
  return { x: cx - 0.9 * s, y: cy - 0.6 * s, w: 1.75 * s, h: 1.08 * s };
}

/**
 * A cloud: paper body, 2 px ink rim, and a halftone shade that deepens toward
 * the base — `weight` 0 for a fair-weather cloud, toward 1 for a rain cloud.
 */
function drawCloud(
  fb: FrameBuffer,
  cx: number,
  cy: number,
  s: number,
  weight: number,
  style: DitherStyle,
): void {
  const inside = cloudInside(cx, cy, s);
  const bounds = cloudBounds(cx, cy, s);
  paintShape(fb, bounds, inside, WHITE, null);
  if (weight > 0) {
    const top = cy - 0.58 * s;
    const span = 1.04 * s;
    ditherRect(fb, bounds, {
      pigment: BLACK,
      background: WHITE,
      inside,
      tone: (_x, y) => weight * (0.25 + 0.75 * Math.max(0, (y - top) / span)),
      brush: style.brush,
      texture: style.texture,
    });
  }
  paintShape(fb, bounds, inside, null, BLACK, 2);
}

/** The sun, exactly as the hero has always drawn it: a flat disc with a thin ink rim. */
function drawSun(
  fb: FrameBuffer,
  a: Anchor,
  pigment: PaletteIndex,
  expressive: boolean,
  style: DitherStyle,
  coverage?: number,
): void {
  fillDiscDither(fb, a.cx, a.cy, a.r, pigment, coverage ?? (expressive ? 1 : 0.8), style, {
    background: WHITE,
    edgeSoftness: expressive ? 0 : 0.2,
  });
  ellipseInclusive(
    fb,
    Math.round(a.cx - a.r),
    Math.round(a.cy - a.r),
    Math.round(a.cx + a.r),
    Math.round(a.cy + a.r),
    undefined,
    BLACK,
  );
}

/**
 * The moon at its real phase. The unlit part is a solid ink body so the disc
 * reads against the dotted night; the lit part is the warm pigment (paper in
 * black & white). A new moon would vanish entirely, so the lit sliver is held
 * at a thin crescent at least — a picture of the night, not an ephemeris.
 */
function drawMoon(
  fb: FrameBuffer,
  a: Anchor,
  moon: MoonPhase,
  lit: PaletteIndex,
): void {
  const MIN = 0.09;
  let p = moon.phase;
  if (p < MIN) p = MIN;
  if (p > 1 - MIN) p = 1 - MIN;
  const waxing = p < 0.5;
  const k = waxing ? Math.cos(2 * Math.PI * p) : Math.cos(2 * Math.PI * (p - 0.5));
  const r = a.r * 0.9;
  const inside: Inside = (x, y) => inDisc(x, y, a.cx, a.cy, r);
  const bounds = { x: a.cx - r - 1, y: a.cy - r - 1, w: 2 * r + 2, h: 2 * r + 2 };
  paintShape(fb, bounds, inside, BLACK, null);
  paintShape(
    fb,
    bounds,
    (x, y) => {
      if (!inside(x, y)) return false;
      const dy = y - a.cy;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const dx = x - a.cx;
      // The terminator is a half-ellipse; the lit limb faces right while waxing.
      return waxing ? dx >= half * k : dx <= half * k;
    },
    lit,
    null,
  );
  if (lit === WHITE) paintShape(fb, bounds, inside, null, BLACK, 1);
}

/** A four-point star: a paper halo so it reads on the dots, then a 2 px cross. */
function drawStar(fb: FrameBuffer, x: number, y: number, size: number, pigment: PaletteIndex): void {
  paintShape(fb, { x: x - size - 1, y: y - size - 1, w: 2 * size + 2, h: 2 * size + 2 }, (px, py) =>
    inDisc(px, py, x, y, size + 1), WHITE, null);
  fb.fillRect(x - size, y - 1, 2 * size, 2, pigment);
  fb.fillRect(x - 1, y - size, 2, 2 * size, pigment);
}

/** Point-in-polygon, even-odd. */
function inPolygon(points: ReadonlyArray<[number, number]>): Inside {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i] as [number, number];
      const [xj, yj] = points[j] as [number, number];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

function drawBolt(
  fb: FrameBuffer,
  x: number,
  y: number,
  h: number,
  pigment: PaletteIndex,
): void {
  const w = h * 0.6;
  const unit: Array<[number, number]> = [
    [0.1, 0],
    [-0.3, 0.55],
    [-0.02, 0.55],
    [-0.18, 1],
    [0.36, 0.38],
    [0.06, 0.38],
    [0.28, 0],
  ];
  const points = unit.map(([ux, uy]) => [x + ux * w, y + uy * h] as [number, number]);
  paintShape(fb, { x: x - w / 2, y, w, h }, inPolygon(points), pigment, BLACK, 2);
}

/* ------------------------------------------------------------------ *
 * Precipitation
 * ------------------------------------------------------------------ */

type Mark = "rain" | "flake" | "pellet";

/**
 * Lay precipitation in a staggered lattice under a cloud. `pattern` cycles the
 * marks across the lattice, so sleet alternates drops and flakes and hail mixes
 * pellets with rain — the same fall, different weather.
 */
function drawFall(
  fb: FrameBuffer,
  area: PixelRect,
  pattern: readonly Mark[],
  pitch: { x: number; y: number },
  heavy = false,
): void {
  const rows = Math.max(1, Math.floor(area.h / pitch.y));
  let n = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = Math.round(area.y + row * pitch.y + pitch.y / 2);
    const offset = row % 2 === 0 ? 0 : pitch.x / 2;
    for (let x = area.x + offset + pitch.x / 2; x < area.x + area.w; x += pitch.x) {
      const mark = pattern[n % pattern.length] as Mark;
      n += 1;
      const px = Math.round(x);
      if (mark === "rain") {
        const len = heavy ? 11 : 8;
        thickLine(fb, px + 2, y - len / 2, px - 2, y + len / 2, BLACK, 2);
      } else if (mark === "flake") {
        thickLine(fb, px - 5, y, px + 5, y, BLACK, 1);
        thickLine(fb, px - 3, y - 4, px + 3, y + 4, BLACK, 1);
        thickLine(fb, px - 3, y + 4, px + 3, y - 4, BLACK, 1);
        fb.fillRect(px - 1, y - 1, 3, 3, BLACK);
      } else {
        paintShape(fb, { x: px - 4, y: y - 4, w: 8, h: 8 }, (qx, qy) => inDisc(qx, qy, px, y, 3.2), WHITE, BLACK, 1);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Fog and wind
 * ------------------------------------------------------------------ */

function drawFogBands(fb: FrameBuffer, a: Anchor, u: number, right: number): void {
  // Stacked strokes of mist with a break in each, never the same break twice.
  const left = a.cx - u * 2.3;
  const rows = [
    [0.1, 0.55, 0.68, 1],
    [0, 0.3, 0.42, 0.9],
    [0.2, 0.7, 0.8, 1],
    [0.05, 0.4, 0.52, 0.85],
  ];
  const span = right - left;
  rows.forEach(([a0, a1, b0, b1], i) => {
    const y = Math.round(a.cy - u * 0.3 + i * u * 0.4);
    thickLine(fb, left + (a0 as number) * span, y, left + (a1 as number) * span, y, BLACK, 3);
    thickLine(fb, left + (b0 as number) * span, y, left + (b1 as number) * span, y, BLACK, 3);
  });
}

function drawWind(fb: FrameBuffer, a: Anchor, u: number, shift: number): void {
  // Three gusts, each a stroke that ends in a curl, stepped like a stave.
  const gusts = [
    { dy: -0.55, x0: -1.9, x1: 0.3, curl: 0.34 },
    { dy: 0.05, x0: -2.2, x1: 0.75, curl: 0.42 },
    { dy: 0.65, x0: -1.6, x1: 0.1, curl: 0.3 },
  ];
  for (const g of gusts) {
    const y = a.cy + g.dy * u;
    const x1 = a.cx - shift + g.x1 * u;
    const cr = g.curl * u;
    thickLine(fb, a.cx - shift + g.x0 * u, y, x1, y, BLACK, 3);
    // The curl rises from the end of the stroke and turns back over it.
    arc(fb, x1, y - cr, cr, 180, 450, BLACK, 3);
  }
}

/* ------------------------------------------------------------------ *
 * Knock-out
 * ------------------------------------------------------------------ */

/**
 * Draw ink marks onto a scratch sheet, then set them on the frame with a paper
 * halo of `radius` px around every inked pixel — the risograph knock-out that
 * keeps type, rain or a gust legible over a dotted sky. Only `rect` is touched,
 * and on bare paper the halo is invisible.
 */
export function inkWithHalo<T>(
  fb: FrameBuffer,
  rect: PixelRect,
  draw: (target: FrameBuffer) => T,
  radius = 2,
): T {
  const sheet = new FrameBuffer(WHITE);
  const result = draw(sheet);
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(fb.width, rect.x + rect.w);
  const y1 = Math.min(fb.height, rect.y + rect.h);
  const reach = radius * radius + 1;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (sheet.get(x, y) === WHITE) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > reach) continue;
          const hx = x + dx;
          const hy = y + dy;
          if (hx < x0 || hy < y0 || hx >= x1 || hy >= y1) continue;
          if (sheet.get(hx, hy) === WHITE) fb.set(hx, hy, WHITE);
        }
      }
    }
  }
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = sheet.get(x, y);
      if (p !== WHITE) fb.set(x, y, p as PaletteIndex);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * The scene
 * ------------------------------------------------------------------ */

/** Fixed star field in fractions of the rect: the same constellation every night. */
const STARS: ReadonlyArray<[number, number, number]> = [
  [0.52, 0.12, 5],
  [0.63, 0.34, 4],
  [0.71, 0.07, 4],
  [0.57, 0.5, 4],
  [0.95, 0.5, 4],
  [0.45, 0.3, 4],
];

/**
 * Draw the whole scene — graded sky, bodies, weather — into `rect`.
 * The caller sets its type over it afterwards and scrubs the frame once.
 */
export function drawWeatherScene(fb: FrameBuffer, rect: PixelRect, spec: SceneSpec): SceneResult {
  // Shapes are drawn freely on a copy of the frame and only the module's own
  // rect is copied back, so a cloud or a curl can never bleed into a neighbour.
  const sheet = fb.clone();
  const result = drawScene(sheet, rect, spec);
  const x0 = Math.max(0, rect.x);
  const x1 = Math.min(fb.width, rect.x + rect.w);
  for (let y = Math.max(0, rect.y); y < Math.min(fb.height, rect.y + rect.h); y += 1) {
    const row = y * fb.width;
    fb.pixels.set(sheet.pixels.subarray(row + x0, row + x1), row + x0);
  }
  return result;
}

function drawScene(fb: FrameBuffer, rect: PixelRect, spec: SceneSpec): SceneResult {
  const { scene, night, style } = spec;
  const bw = spec.colourUse === "blackwhite";
  const expressive = spec.colourUse === "expressive";
  const a = anchorFor(rect);
  const warm = bw ? WHITE : YELLOW;

  // 1. The sky. Clear, broken and windy days are warm; weather greys it; night
  //    inks it. Every field fades to bare paper well before the foot, where
  //    the big number sits.
  const sunny = scene === "clear" || scene === "partly" || scene === "wind";
  const grey: Record<WeatherScene, number> = {
    clear: 0.46,
    partly: 0.46,
    wind: 0.4,
    cloudy: 0.3,
    rain: 0.36,
    pouring: 0.42,
    storm: 0.5,
    snow: 0.18,
    sleet: 0.26,
    hail: 0.3,
    fog: 0.24,
  };
  let fieldPigment: PaletteIndex;
  let from: number;
  if (night) {
    fieldPigment = BLACK;
    from = expressive ? 0.86 : 0.78;
  } else if (scene === null) {
    fieldPigment = BLACK;
    from = 0.22;
  } else if (sunny && !bw) {
    fieldPigment = YELLOW;
    from = expressive ? (scene === "clear" ? 0.62 : 0.54) : grey[scene];
  } else {
    fieldPigment = BLACK;
    from = grey[scene] + (expressive ? 0.06 : 0);
  }
  fillBandDither(fb, rect, fieldPigment, {
    from,
    to: expressive ? -0.35 : -0.28,
    axis: "y",
    style,
    background: WHITE,
  });

  if (scene === null) return { fieldPigment };

  const bottom = rect.y + Math.round(rect.h * 0.82);
  const right = rect.x + rect.w - 4;

  // 2. The body in the sky: sun by day, the real moon by night, and the stars
  //    when nothing covers them.
  const body = (coverage?: number): void => {
    if (night) drawMoon(fb, a, spec.moon, warm);
    else drawSun(fb, a, bw ? BLACK : expressive ? RED : YELLOW, expressive, style, coverage);
  };
  if (night && (scene === "clear" || scene === "partly" || scene === "wind")) {
    for (const [fx, fy, size] of STARS) {
      const sx = Math.round(rect.x + fx * rect.w);
      const sy = Math.round(rect.y + fy * rect.h);
      if (inDisc(sx, sy, a.cx, a.cy, a.r + size + 6)) continue;
      drawStar(fb, sx, sy, size, bw ? BLACK : YELLOW);
    }
  }

  // Weather is drawn at its own scale, `u`, which grows with the module so a
  // full-panel hero gets a full-size cloud; the sun keeps its historic size.
  const u = Math.max(12, Math.min(Math.round(rect.h * 0.2), Math.round(rect.w * 0.11), 46));
  // Clouds: the main one sits low-left of the anchor, a paler one behind,
  // the pair pushed back inside the rect if it would overhang the edge.
  const front = { cx: a.cx - u * 0.35, cy: a.cy + u * 0.25, s: u * 1.55 };
  const back = { cx: a.cx + u * 0.55, cy: a.cy - u * 0.5, s: u * 1.05 };
  const overhang = Math.max(front.cx + front.s * 0.8, back.cx + back.s * 0.8) - (right - 2);
  if (overhang > 0) {
    front.cx -= overhang;
    back.cx -= overhang;
  }
  const lift = rect.y + 4 - (back.cy - back.s * 0.58);
  if (lift > 0) {
    front.cy += lift;
    back.cy += lift;
  }
  const fallArea = (depth = 2.2): PixelRect => {
    const top = Math.round(front.cy + front.s * 0.46 + 5);
    const x0 = Math.round(front.cx - front.s * 0.72);
    const foot = Math.min(bottom, top + Math.round(depth * u));
    return { x: x0, y: top, w: Math.min(right, Math.round(front.cx + front.s * 0.62)) - x0, h: Math.max(0, foot - top) };
  };
  // Clouds are plain paper by night so they read as lit shapes against the ink.
  const shade = night ? 0 : 1;
  const overcast = (weight: number, backWeight: number): void => {
    drawCloud(fb, back.cx, back.cy, back.s, backWeight * shade, style);
    drawCloud(fb, front.cx, front.cy, front.s, weight * shade, style);
  };
  // Line marks (rain, flakes, mist, gusts) get a paper knock-out on a dark
  // sky; by day they sit on paper and are drawn straight.
  const marks = (draw: (target: FrameBuffer) => void): void => {
    if (night || fieldPigment === BLACK) inkWithHalo(fb, rect, draw, night ? 2 : 1);
    else draw(fb);
  };

  switch (scene) {
    case "clear":
      body();
      break;
    case "partly": {
      body();
      drawCloud(fb, a.cx - u * 0.75, a.cy + u * 0.55, u * 1.25, 0, style);
      break;
    }
    case "cloudy":
      if (night) body();
      overcast(0.12, 0.38);
      break;
    case "rain":
      overcast(0.34, 0.5);
      marks((t) => drawFall(t, fallArea(), ["rain"], { x: 12, y: 15 }));
      break;
    case "pouring":
      overcast(0.5, 0.62);
      marks((t) => drawFall(t, fallArea(), ["rain"], { x: 8, y: 12 }, true));
      break;
    case "storm": {
      overcast(0.55, 0.66);
      const area = fallArea();
      marks((t) => drawFall(t, area, ["rain"], { x: 13, y: 16 }));
      drawBolt(fb, front.cx + front.s * 0.02, front.cy + front.s * 0.15, Math.max(24, Math.min(area.h + front.s * 0.3, u * 2.4)), bw ? WHITE : YELLOW);
      break;
    }
    case "snow":
      overcast(0.1, 0.3);
      marks((t) => drawFall(t, fallArea(1.8), ["flake"], { x: 17, y: 17 }));
      break;
    case "sleet":
      overcast(0.26, 0.42);
      marks((t) => drawFall(t, fallArea(1.8), ["rain", "flake"], { x: 14, y: 16 }));
      break;
    case "hail":
      overcast(0.34, 0.5);
      marks((t) => drawFall(t, fallArea(1.8), ["pellet", "rain"], { x: 14, y: 15 }));
      break;
    case "fog":
      // A washed-out body behind the mist.
      if (night) body();
      else if (!bw) drawSun(fb, a, YELLOW, false, style, 0.45);
      marks((t) => drawFogBands(t, a, u, right));
      break;
    case "wind":
      // By night the gusts blow in front of the moon, not through it.
      if (night) body();
      marks((t) => drawWind(t, a, u, night ? a.r + u * 0.9 : 0));
      break;
  }

  return { fieldPigment };
}
