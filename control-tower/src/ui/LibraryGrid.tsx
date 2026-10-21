"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PREVIEW_RGB_TRIPLETS } from "@/core/palette";
import { decodeTile } from "@/core/render/imageDither";
import {
  LIBRARY,
  LIBRARY_FAMILIES,
  type LibraryEntry,
  type LibraryFamily,
} from "@/core/library/catalog";
import { LIBRARY_THUMBS } from "@/core/library/thumbs.generated";

/**
 * The embedded picture library as a browsable grid: family chips, a name
 * search, and one button per drawing. Each thumbnail is the real 100 x 100
 * panel tile painted in the panel's three inks, so the grid shows what the
 * panel will show.
 */

function Thumb({ id, label }: { id: string; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const data = LIBRARY_THUMBS[id];
    if (!canvas || !data) return;
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const indices = decodeTile(data, 100, 100);
    const out = ctx.createImageData(100, 100);
    for (let i = 0; i < 10000; i += 1) {
      const [r, g, b] = PREVIEW_RGB_TRIPLETS[indices[i] as number] as readonly [number, number, number];
      out.data[i * 4] = r;
      out.data[i * 4 + 1] = g;
      out.data[i * 4 + 2] = b;
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }, [id]);
  return <canvas ref={ref} className="library-thumb" aria-label={label} role="img" />;
}

function matches(entry: LibraryEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.id.includes(q) ||
    entry.tags.some((tag) => tag.includes(q))
  );
}

export function LibraryGrid({
  onPick,
  busyId,
  selectedId,
  testId = "library",
}: {
  onPick: (id: string) => void;
  busyId?: string | null;
  selectedId?: string | null;
  testId?: string;
}) {
  const [family, setFamily] = useState<LibraryFamily | "all">("all");
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () =>
      LIBRARY.filter(
        (entry) => (family === "all" || entry.family === family) && matches(entry, query),
      ),
    [family, query],
  );

  return (
    <div className="library" data-testid={testId}>
      <input
        type="search"
        className="library-search"
        placeholder="Search pictures"
        aria-label="Search pictures"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-testid={`${testId}-search`}
      />
      <div className="library-chips" role="group" aria-label="Filter by family">
        <button
          type="button"
          className="library-chip"
          aria-pressed={family === "all"}
          onClick={() => setFamily("all")}
          data-testid={`${testId}-chip-all`}
        >
          All
        </button>
        {LIBRARY_FAMILIES.map((f) => (
          <button
            type="button"
            key={f.key}
            className="library-chip"
            aria-pressed={family === f.key}
            onClick={() => setFamily(f.key)}
            data-testid={`${testId}-chip-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="field-hint" data-testid={`${testId}-empty`}>
          No picture matches “{query}”.
        </p>
      ) : (
        <div className="library-grid">
          {shown.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className="library-item"
              title={entry.name}
              aria-pressed={selectedId === entry.id}
              disabled={busyId === entry.id}
              onClick={() => onPick(entry.id)}
              data-testid={`${testId}-item-${entry.id}`}
            >
              <Thumb id={entry.id} label={entry.name} />
              <span className="library-name">{entry.name}</span>
            </button>
          ))}
        </div>
      )}
      <p className="field-hint library-credit">
        25 drawings made for this panel by the NOTE4C project, free to use (CC0).
      </p>
    </div>
  );
}
