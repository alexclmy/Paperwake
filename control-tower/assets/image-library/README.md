# NOTE4C image library

25 original illustrations drawn for the NOTE4C 400 x 300 e-paper panel's three
inks — black, white and red — in one collection style: bold outlines, fine
interior detail, engraved hatching and stipple for shade (never grey), and red
kept for one or two focal points. Licence: **CC0** (see `LICENSE`).

| Family | Pictures |
| --- | --- |
| Home & daily | coffee, plant, door, goodnight, groceries |
| Weather & nature | sunrise, mountains, wave, umbrella, snowflake |
| Mood & messages | heart, balloon, thumbsup, dnd, rocket |
| Seasons & holidays | christmas, pumpkin, maple, fireworks, vacation |
| Tech & fun | mascot, robot, cat, controller, astronaut |

## How it is built

- `svg/<id>.svg` — the full drawing, authored on a 400 x 300 canvas.
- `svg/<id>.thumb.svg` — a simplified, square drawing for small blocks, so
  lines stay at least 2 px and the subject stays legible at 100 x 100 and 50 x 50.

`npx tsx tools/build-image-library.ts` rasterises them with resvg, **anti-aliasing
off**, and maps every pixel to an exact palette index. Shading is written in the
SVG as reserved "ink code" colours and replaced by device-pixel patterns after
rasterising, so hatching stays crisp at every size:

| Colour in the SVG | Becomes |
| --- | --- |
| `#000` / `#fff` / `#f00` | black / paper / red |
| grey `rgb(v,v,v)` | diagonal hatch, cross-hatch past ~70 % (density = 1 − v/255) |
| green `rgb(0,v,0)` | horizontal engraving lines |
| blue `rgb(0,0,v)` | ordered stipple |
| pink `rgb(255,v,v)` | red hatch on paper |
| `rgb(128,0,0)` | red/black cross-hatch (deep red shade) |

Any other colour fails the build. Each picture becomes five 2bpp tiles in
`src/core/library/art/<id>.ts`: full 400x300, large 300x225, half 200x150 (from
the main drawing) and thumb 100x100, mini 50x50 (from the thumb drawing). The
Image module stores the tile that best fits its block, unscaled.

`npx tsx tools/build-image-library.ts --check` verifies the generated files are
up to date; `npx tsx tools/image-library-sheet.ts <dir>` renders every variant
through the real panel renderer and writes a contact sheet.
