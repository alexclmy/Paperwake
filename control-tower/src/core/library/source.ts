import { ImageSourceSchema, type ImageSource } from "@/core/render/modules/image";
import { pickVariant, type LibraryArt } from "./catalog";

/**
 * The Image module's stored source for a library picture at a tile size: the
 * best-fitting finished variant, stored exactly as an upload would be. The
 * renderer centres it in the block, so a picture smaller than its block sits
 * on paper rather than being stretched.
 */
export function librarySource(
  id: string,
  art: LibraryArt,
  tileW: number,
  tileH: number,
  base: Partial<ImageSource> = {},
): ImageSource {
  const tile = pickVariant(art, tileW, tileH);
  return ImageSourceSchema.parse({
    ...base,
    fit: "contain",
    mode: "poster",
    tileW: tile.w,
    tileH: tile.h,
    data: tile.data,
    library: id,
  });
}
