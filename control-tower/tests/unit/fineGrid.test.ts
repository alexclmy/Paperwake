import { describe, expect, it } from "vitest";
import { pack } from "@/core/frame";
import { MODULE_TYPES, moduleDefinition } from "@/core/render/modules";
import { RenderReport, renderDashboard } from "@/core/render";
import { cellsToPixels, GRID_COLS, GRID_ROWS } from "@/core/render/types";
import {
  DASHBOARD_SCHEMA_VERSION,
  NO_ROOM_MESSAGE,
  autoLayout,
  findPlacement,
  layoutProblems,
  parseDashboard,
  type DashboardDoc,
  type ModuleInstance,
} from "@/core/model";
import { migrateDashboardDoc } from "@/core/migrate";
import { TEMPLATES } from "@/core/templates";
import { DEFAULT_THEME } from "@/core/theme";
import { sha256HexSync } from "@/server/hash";
import { FIXTURE_CTX, fixtureSources, noSources } from "./fixtures/render";

function doc(modules: ModuleInstance[], padding = 0): DashboardDoc {
  return {
    schema_version: DASHBOARD_SCHEMA_VERSION,
    id: "d_fine",
    title: "Fine",
    status: "active",
    grid: { cols: GRID_COLS, rows: GRID_ROWS },
    theme: { ...DEFAULT_THEME, contentPadding: padding },
    refreshIntervalMinutes: null,
    modules,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function mod(id: string, type: string, x: number, y: number, w: number, h: number, options?: Record<string, unknown>): ModuleInstance {
  return {
    id, type, x, y, w, h, hidden: false,
    options: options ?? { ...(moduleDefinition(type).defaultOptions as Record<string, unknown>) },
  };
}

/** A legacy 8x6 composition, as schema 5 stored it, using an explicit variant. */
function legacyV5(padding = 0): Record<string, unknown> {
  const opt = (type: string, extra: Record<string, unknown> = {}) => ({
    ...(moduleDefinition(type).defaultOptions as Record<string, unknown>), ...extra,
  });
  return {
    schema_version: 5,
    id: "d_legacy",
    title: "Legacy",
    status: "active",
    grid: { cols: 8, rows: 6 },
    theme: { ...DEFAULT_THEME, contentPadding: padding },
    refreshIntervalMinutes: null,
    modules: [
      { id: "a", type: "weather24h", x: 0, y: 0, w: 6, h: 3, hidden: false, options: opt("weather24h") },
      { id: "b", type: "octopus", x: 6, y: 0, w: 2, h: 2, hidden: false, options: opt("octopus") },
      { id: "c", type: "calendarNext", x: 0, y: 3, w: 5, h: 2, hidden: false, options: opt("calendarNext", { variant: "list" }) },
      { id: "d", type: "message", x: 5, y: 3, w: 3, h: 1, hidden: false, options: opt("message") },
      { id: "e", type: "timestamp", x: 5, y: 4, w: 3, h: 1, hidden: false, options: opt("timestamp") },
      { id: "f", type: "weatherCompact", x: 0, y: 5, w: 5, h: 1, hidden: false, options: opt("weatherCompact", { format: "oneLine" }) },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * The legacy renderer, reimplemented independently: 8x6 cells, floor division.
 * Proves the migrated rects equal the rects the old build computed.
 */
function legacyRect(x: number, y: number, w: number, h: number, padding: number) {
  const cw = 400 - padding * 2;
  const ch = 300 - padding * 2;
  const left = padding + Math.floor((x * cw) / 8);
  const right = padding + Math.floor(((x + w) * cw) / 8);
  const top = padding + Math.floor((y * ch) / 6);
  const bottom = padding + Math.floor(((y + h) * ch) / 6);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

describe("8x6 -> 16x12 migration", () => {
  it("doubles every coordinate and writes the new grid", () => {
    const migrated = migrateDashboardDoc(legacyV5()) as DashboardDoc;
    expect(migrated.schema_version).toBe(6);
    expect(migrated.grid).toEqual({ cols: 16, rows: 12 });
    expect(migrated.modules.map((m) => [m.x, m.y, m.w, m.h])).toEqual([
      [0, 0, 12, 6], [12, 0, 4, 4], [0, 6, 10, 4], [10, 6, 6, 2], [10, 8, 6, 2], [0, 10, 10, 2],
    ]);
  });

  it("keeps explicit variants and every other field", () => {
    const raw = legacyV5();
    const migrated = parseDashboard(raw);
    expect((migrated.modules[2]?.options as { variant: string }).variant).toBe("list");
    expect((migrated.modules[5]?.options as { format: string }).format).toBe("oneLine");
    expect(migrated.title).toBe("Legacy");
    expect(migrated.createdAt).toBe(raw.createdAt);
  });

  it("is idempotent", () => {
    const once = migrateDashboardDoc(legacyV5());
    expect(migrateDashboardDoc(once)).toEqual(once);
  });

  it("maps every legacy cell rect to the identical pixels, at every padding", () => {
    for (let padding = 0; padding <= 24; padding += 1) {
      for (let x = 0; x < 8; x += 1)
        for (let y = 0; y < 6; y += 1)
          for (let w = 1; x + w <= 8; w += 1)
            for (let h = 1; y + h <= 6; h += 1) {
              expect(cellsToPixels(x * 2, y * 2, w * 2, h * 2, padding)).toEqual(
                legacyRect(x, y, w, h, padding),
              );
            }
    }
  });

  it("renders a migrated composition byte-identically to the same layout on 8x6 rects", () => {
    for (const padding of [0, 6, 13]) {
      const migrated = parseDashboard(legacyV5(padding));
      const bytes = sha256HexSync(pack(renderDashboard(migrated, fixtureSources(), FIXTURE_CTX)));
      // Reference: render each module straight into its legacy rect.
      const ref = parseDashboard(legacyV5(padding));
      const fb = renderDashboard({ ...ref, modules: [] }, fixtureSources(), FIXTURE_CTX);
      for (const m of (legacyV5(padding).modules as ModuleInstance[])) {
        const def = moduleDefinition(m.type);
        const rect = legacyRect(m.x, m.y, m.w, m.h, padding);
        const options = def.schema.parse(m.options);
        const data = m.type === "weather24h" || m.type === "octopus" || m.type === "weatherCompact"
          ? fixtureSources().weather
          : m.type === "calendarNext" ? fixtureSources().calendar : { state: "ok" as const };
        def.render(fb, rect, data, options, { ...FIXTURE_CTX, theme: ref.theme, sources: fixtureSources() });
      }
      expect(bytes).toBe(sha256HexSync(pack(fb)));
    }
  });

  it("migrates templates and the starter to valid 16x12 layouts", () => {
    for (const template of TEMPLATES) {
      const built = template.build(new Date("2026-10-01T00:00:00Z"));
      expect(layoutProblems(built), template.key).toEqual([]);
    }
  });
});

/**
 * A minimum can never exceed twice the 8x6 minimum, or a composition saved on
 * the coarse grid would fail validation after migration. Where that cap is
 * tighter than what renders cleanly in every state, the module is listed here
 * with the span at which it does render cleanly; at its minimum it still marks
 * the overflow in red on the panel (never a silent cut).
 */
const CLEAN_SPAN_ABOVE_MIN: Record<string, { w: number; h: number }> = {
  weather24h: { w: 8, h: 5 },
  calendarNext: { w: 8, h: 1 },
  list: { w: 5, h: 2 },
  conditionalMessage: { w: 5, h: 2 },
  homeSensors: { w: 6, h: 1 },
  timestamp: { w: 6, h: 1 },
  image: { w: 5, h: 2 },
};

/** The minimums of the 8x6 build, in fine cells (x2). */
const LEGACY_MIN_X2: Record<string, { w: number; h: number }> = {
  headline: { w: 8, h: 4 }, sky: { w: 6, h: 4 }, weather24h: { w: 8, h: 4 },
  weatherHero: { w: 10, h: 6 }, weatherWeek: { w: 12, h: 4 }, weatherCompact: { w: 8, h: 2 },
  calendarNext: { w: 6, h: 4 }, haSensor: { w: 4, h: 2 }, homeSensors: { w: 4, h: 2 },
  message: { w: 4, h: 2 }, list: { w: 4, h: 2 }, countdown: { w: 4, h: 2 },
  conditionalMessage: { w: 4, h: 2 }, timestamp: { w: 4, h: 2 }, octopus: { w: 4, h: 4 },
  image: { w: 2, h: 2 },
};

function overflowsAt(type: string, w: number, h: number): string[] {
  const out: string[] = [];
  for (const sources of [fixtureSources(), noSources()]) {
    const report = new RenderReport();
    const d = doc([mod("m", type, 0, 0, w, h)]);
    expect(layoutProblems(d)).toEqual([]);
    renderDashboard(d, sources, FIXTURE_CTX, report);
    out.push(...report.overflows.map((o) => `${o.role}:${o.kind}:${o.neededPx}/${o.availablePx}`));
  }
  return out;
}

describe("per-module minimum sizes", () => {
  for (const type of MODULE_TYPES) {
    it(`${type}: renders cleanly at its minimum (or at its listed clean span)`, () => {
      const def = moduleDefinition(type);
      const span = CLEAN_SPAN_ABOVE_MIN[type] ?? def.minSpan;
      expect(overflowsAt(type, span.w, span.h), `${type} ${span.w}x${span.h}`).toEqual([]);
    });
    it(`${type}: minimum never exceeds the migrated 8x6 minimum`, () => {
      const def = moduleDefinition(type);
      const legacy = LEGACY_MIN_X2[type];
      expect(legacy, type).toBeDefined();
      expect(def.minSpan.w).toBeLessThanOrEqual(legacy!.w);
      expect(def.minSpan.h).toBeLessThanOrEqual(legacy!.h);
    });
  }

  it("one-line modules go down to a single 25 px row", () => {
    for (const type of ["weatherCompact", "calendarNext", "homeSensors", "timestamp", "message"]) {
      expect(moduleDefinition(type).minSpan.h, type).toBe(1);
    }
  });
});

describe("size-adaptive Auto variant", () => {
  it("new calendar tiles start on auto and pick a disposition by height", () => {
    const def = moduleDefinition("calendarNext");
    expect((def.defaultOptions as { variant: string }).variant).toBe("auto");
    const digest = (h: number, variant: string) => {
      const d = doc([mod("c", "calendarNext", 0, 0, 10, h, { ...(def.defaultOptions as object), variant })]);
      return sha256HexSync(pack(renderDashboard(d, fixtureSources(), FIXTURE_CTX)));
    };
    expect(digest(6, "auto")).toBe(digest(6, "list"));
    expect(digest(1, "auto")).not.toBe(digest(1, "list"));
  });

  it("auto weatherCompact shows the day parts only when tall enough", () => {
    const def = moduleDefinition("weatherCompact");
    const digest = (h: number, format: string) => {
      const d = doc([mod("w", "weatherCompact", 0, 0, 16, h, { ...(def.defaultOptions as object), format })]);
      return sha256HexSync(pack(renderDashboard(d, fixtureSources(), FIXTURE_CTX)));
    };
    expect(digest(2, "auto")).toBe(digest(2, "oneLine"));
    expect(digest(4, "auto")).toBe(digest(4, "dayParts"));
  });
});

describe("always insertable", () => {
  it("uses the default size when it fits", () => {
    const p = findPlacement(doc([]), "weather24h");
    expect(p).toMatchObject({ x: 0, y: 0, w: 16, h: 6, shrunk: false });
  });

  it("shrinks to fit the free space instead of refusing", () => {
    // Only a 16x2 strip is free: weather24h (default 16x6) cannot fit at size.
    const full = doc([mod("a", "weatherHero", 0, 0, 16, 10)]);
    const p = findPlacement(full, "calendarNext");
    expect(p).not.toBeNull();
    expect(p).toMatchObject({ y: 10, shrunk: true });
    expect((p?.h ?? 0)).toBeLessThanOrEqual(2);
    const placed = doc([...full.modules, mod("n", "calendarNext", p!.x, p!.y, p!.w, p!.h)]);
    expect(layoutProblems(placed)).toEqual([]);
  });

  it("returns null (and the caller says so) when not even the minimum fits", () => {
    const full = doc([mod("a", "image", 0, 0, 16, 12)]);
    expect(findPlacement(full, "message")).toBeNull();
    expect(NO_ROOM_MESSAGE).toBe("No room left: shrink or remove a block");
  });

  it("fits six or more small blocks on one panel", () => {
    let d = doc([]);
    const types = ["weatherCompact", "calendarNext", "timestamp", "message", "homeSensors", "haSensor", "countdown", "octopus"];
    for (const type of types) {
      const p = findPlacement(d, type, moduleDefinition(type).minSpan);
      expect(p, type).not.toBeNull();
      d = doc([...d.modules, mod(`m${d.modules.length}`, type, p!.x, p!.y, p!.w, p!.h)]);
    }
    expect(d.modules.length).toBe(8);
    expect(layoutProblems(d)).toEqual([]);
  });
});

describe("auto layout", () => {
  it("packs rows top to bottom, keeps order, fills the width, no overlap", () => {
    const d = doc([
      mod("a", "message", 3, 9, 8, 2),
      mod("b", "timestamp", 0, 0, 6, 1),
      mod("c", "calendarNext", 9, 3, 6, 4),
    ]);
    const out = autoLayout(d)!;
    expect(out).not.toBeNull();
    expect(layoutProblems(out)).toEqual([]);
    const byId = Object.fromEntries(out.modules.map((m) => [m.id, m]));
    // Reading order: b (row 0), c (row 3), a (row 9).
    expect(byId.b).toMatchObject({ x: 0, y: 0 });
    expect(byId.c).toMatchObject({ x: 6, y: 0 });
    // The last block of the row grows toward the edge, up to its own maximum.
    expect(byId.c!.w).toBeGreaterThanOrEqual(6);
    expect(byId.a!.y).toBeGreaterThanOrEqual(byId.c!.h);
    expect(out.modules.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("respects minimums when the stack overruns the grid", () => {
    const d = doc(Array.from({ length: 6 }, (_, i) => mod(`m${i}`, "headline", 0, i * 2, 16, 4)));
    const out = autoLayout(d);
    if (out) {
      expect(layoutProblems(out)).toEqual([]);
    }
  });
});
