import type { LibraryArt } from "./catalog";

/**
 * Library tiles already in memory, by picture id.
 *
 * The Image module picks the library variant from the block's CURRENT pixel
 * size at render time (see modules/image.ts), so a resized block shows the
 * right drawing on the very next render instead of waiting for a re-pick.
 * Rendering is synchronous, so the art must already be here: the browser
 * fills it through `loadLibraryArt` (FramePreview preloads the ids a document
 * uses), the server registers every picture up front (./allArt). When a
 * picture is not loaded yet, the renderer falls back to the stored tile.
 */
const registry = new Map<string, LibraryArt>();

export function registerLibraryArt(id: string, art: LibraryArt): void {
  registry.set(id, art);
}

export function registeredLibraryArt(id: string): LibraryArt | undefined {
  return registry.get(id);
}
