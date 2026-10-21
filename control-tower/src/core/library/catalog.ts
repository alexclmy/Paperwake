/**
 * The embedded image library: 25 hand-drawn, CC0 illustrations made for this
 * panel's three inks (black, white, red).
 *
 * Sources are SVG in assets/image-library/svg; tools/build-image-library.ts
 * rasterises each one, without anti-aliasing, to five finished 2bpp tiles and
 * writes them to ./art/<id>.ts. Every variant is a ready tile in exactly the
 * shape the Image module stores, so inserting a library picture is the same
 * as uploading one: the module keeps the tile, and the renderer only blits.
 *
 * Nothing in this file pulls the art itself; `loadLibraryArt` imports one
 * picture on demand so the picker does not ship 2 MB of tiles up front.
 */

import { registerLibraryArt, registeredLibraryArt } from "./registry";

export const LIBRARY_FAMILIES = [
  { key: "home", label: "Home & daily" },
  { key: "nature", label: "Weather & nature" },
  { key: "mood", label: "Mood & messages" },
  { key: "seasons", label: "Seasons & holidays" },
  { key: "fun", label: "Tech & fun" },
] as const;
export type LibraryFamily = (typeof LIBRARY_FAMILIES)[number]["key"];

export interface LibraryEntry {
  id: string;
  name: string;
  family: LibraryFamily;
  tags: readonly string[];
}

export const LIBRARY: readonly LibraryEntry[] = [
  { id: "coffee", name: "Morning coffee", family: "home", tags: ["cup", "morning", "breakfast", "steam"] },
  { id: "plant", name: "Watering the plant", family: "home", tags: ["plant", "water", "garden", "reminder"] },
  { id: "door", name: "Front door & keys", family: "home", tags: ["home", "keys", "welcome", "leave"] },
  { id: "goodnight", name: "Good night", family: "home", tags: ["bed", "moon", "sleep", "night"] },
  { id: "groceries", name: "Grocery basket", family: "home", tags: ["shopping", "food", "list", "market"] },
  { id: "sunrise", name: "Sunrise over hills", family: "nature", tags: ["sun", "morning", "landscape", "dawn"] },
  { id: "mountains", name: "Snowy mountains", family: "nature", tags: ["snow", "winter", "landscape", "peak"] },
  { id: "wave", name: "Great wave", family: "nature", tags: ["sea", "ocean", "japan", "print"] },
  { id: "umbrella", name: "Rain & red umbrella", family: "nature", tags: ["rain", "weather", "cloud", "umbrella"] },
  { id: "snowflake", name: "Snowflake", family: "nature", tags: ["snow", "winter", "cold", "geometric"] },
  { id: "heart", name: "Red heart", family: "mood", tags: ["love", "valentine", "thanks"] },
  { id: "balloon", name: "Birthday balloons", family: "mood", tags: ["birthday", "party", "confetti", "celebrate"] },
  { id: "thumbsup", name: "Thumbs up", family: "mood", tags: ["ok", "good", "yes", "well done"] },
  { id: "dnd", name: "Do not disturb", family: "mood", tags: ["sleep", "quiet", "nap", "busy"] },
  { id: "rocket", name: "Rocket launch", family: "mood", tags: ["launch", "space", "go", "start"] },
  { id: "christmas", name: "Christmas tree", family: "seasons", tags: ["christmas", "holiday", "winter", "gifts"] },
  { id: "pumpkin", name: "Halloween pumpkin", family: "seasons", tags: ["halloween", "autumn", "october"] },
  { id: "maple", name: "Maple leaf", family: "seasons", tags: ["autumn", "fall", "canada"] },
  { id: "fireworks", name: "New Year fireworks", family: "seasons", tags: ["new year", "party", "night", "city"] },
  { id: "vacation", name: "Palm tree & sun", family: "seasons", tags: ["holiday", "summer", "beach", "away"] },
  { id: "mascot", name: "NOTE4C mascot", family: "fun", tags: ["logo", "note4c", "screen", "hello"] },
  { id: "robot", name: "Friendly robot", family: "fun", tags: ["robot", "tech", "hello", "bot"] },
  { id: "cat", name: "Curled-up cat", family: "fun", tags: ["cat", "pet", "sleep", "cosy"] },
  { id: "controller", name: "Game controller", family: "fun", tags: ["game", "play", "console"] },
  { id: "astronaut", name: "Floating astronaut", family: "fun", tags: ["space", "astronaut", "planet"] },
];

export function libraryEntry(id: string): LibraryEntry | undefined {
  return LIBRARY.find((entry) => entry.id === id);
}

export interface LibraryTile {
  w: number;
  h: number;
  data: string;
}

export type LibraryVariantKey = "full" | "large" | "half" | "thumb" | "mini";
export type LibraryArt = Record<LibraryVariantKey, LibraryTile>;

/**
 * Choose the variant for a tile: the largest that fits whole inside it, so
 * the picture is never cropped and never scaled (scaling a 2bpp drawing
 * destroys its hatching). Ties go to the landscape drawings, which carry the
 * full composition; the square, simplified thumb drawings win only where the
 * block is too narrow or too short for them. A block smaller than every
 * variant gets the smallest one, centred and clipped by the module.
 */
export function pickVariant(
  art: LibraryArt,
  tileW: number,
  tileH: number,
): LibraryTile {
  const order: LibraryVariantKey[] = ["full", "large", "half", "thumb", "mini"];
  let best: LibraryTile | null = null;
  for (const key of order) {
    const v = art[key];
    if (v.w > tileW || v.h > tileH) continue;
    if (!best || v.w * v.h > best.w * best.h) best = v;
  }
  return best ?? art.mini;
}

/** Import one picture's tiles on demand (code-split per picture). */
export async function loadLibraryArt(id: string): Promise<LibraryArt | null> {
  if (!libraryEntry(id)) return null;
  const cached = registeredLibraryArt(id);
  if (cached) return cached;
  const mod = (await import(`./art/${id}.ts`)) as LibraryArt;
  const art = { full: mod.full, large: mod.large, half: mod.half, thumb: mod.thumb, mini: mod.mini };
  registerLibraryArt(id, art);
  return art;
}
