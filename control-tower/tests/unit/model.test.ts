import { describe, expect, it } from "vitest";
import {
  DASHBOARD_SCHEMA_VERSION,
  applyDrag,
  DashboardValidationError,
  assertValidDashboard,
  emptyDashboard,
  findFreeSlot,
  layoutProblems,
  newDashboardId,
  newModuleId,
  normalizeDashboard,
  overlaps,
  parseDashboard,
  starterDashboard,
  type DashboardDoc,
  type ModuleInstance,
} from "@/core/model";
import { GRID_COLS, GRID_ROWS } from "@/core/render/types";
import { DEFAULT_THEME } from "@/core/theme";
import { moduleDefinition } from "@/core/render/modules";
import type { TextElement } from "@/core/render/text";

function doc(modules: ModuleInstance[]): DashboardDoc {
  return {
    schema_version: DASHBOARD_SCHEMA_VERSION,
    id: "d_test",
    title: "Test",
    status: "active",
    grid: { cols: GRID_COLS, rows: GRID_ROWS },
    theme: DEFAULT_THEME,
    refreshIntervalMinutes: null,
    modules,
    createdAt: "2026-09-11T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:00.000Z",
  };
}

function mod(
  id: string,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: Record<string, unknown> = {},
): ModuleInstance {
  return { id, type, x, y, w, h, hidden: false, options };
}

describe("grid", () => {
  it("is 16 columns by 12 rows of 25 px cells", () => {
    expect(GRID_COLS).toBe(16);
    expect(GRID_ROWS).toBe(12);
    expect(GRID_COLS * 25).toBe(400);
    expect(GRID_ROWS * 25).toBe(300);
  });
});

describe("layout validation", () => {
  it("accepts the starter dashboard", () => {
    expect(layoutProblems(starterDashboard("Kitchen panel"))).toEqual([]);
  });

  it("accepts an empty dashboard", () => {
    expect(layoutProblems(emptyDashboard("Blank"))).toEqual([]);
  });

  it("rejects a module that runs past the right edge", () => {
    const problems = layoutProblems(
      doc([mod("a", "haSensor", 12, 0, 6, 2)]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/runs past the 16x12 grid/);
  });

  it("rejects a module that runs past the bottom edge", () => {
    const problems = layoutProblems(doc([mod("a", "octopus", 0, 10, 4, 4)]));
    expect(problems[0]).toMatch(/runs past the 16x12 grid/);
  });

  it("rejects overlapping modules", () => {
    const problems = layoutProblems(
      doc([mod("a", "haSensor", 0, 0, 6, 2), mod("b", "haSensor", 4, 0, 6, 2)]),
    );
    expect(problems).toContain('Modules "a" and "b" overlap');
  });

  it("allows modules that only touch edges", () => {
    expect(
      layoutProblems(
        doc([
          mod("a", "haSensor", 0, 0, 6, 2),
          mod("b", "haSensor", 6, 0, 6, 2),
          mod("c", "haSensor", 0, 2, 6, 2),
        ]),
      ),
    ).toEqual([]);
  });

  it("rejects an unknown module type", () => {
    const problems = layoutProblems(doc([mod("a", "teleporter", 0, 0, 4, 2)]));
    expect(problems[0]).toMatch(/Unknown module type "teleporter"/);
  });

  it("rejects a duplicate module id", () => {
    const problems = layoutProblems(
      doc([mod("a", "haSensor", 0, 0, 6, 2), mod("a", "haSensor", 6, 0, 6, 2)]),
    );
    expect(problems).toContain('Duplicate module id "a"');
  });

  it("rejects a module smaller than its minimum span", () => {
    const problems = layoutProblems(doc([mod("a", "octopus", 0, 0, 2, 2)]));
    expect(problems.some((p) => /smaller than octopus allows/.test(p))).toBe(
      true,
    );
  });

  it("rejects a module larger than its maximum span", () => {
    const problems = layoutProblems(doc([mod("a", "timestamp", 0, 0, 16, 2)]));
    expect(problems.some((p) => /larger than timestamp allows/.test(p))).toBe(
      true,
    );
  });

  it("rejects options its module schema refuses", () => {
    const problems = layoutProblems(
      doc([
        mod("a", "haSensor", 0, 0, 6, 2, {
          entityId: "light.kitchen",
          label: "Lumière",
        }),
      ]),
    );
    expect(
      problems.some((p) =>
        /Only sensor\. and binary_sensor\. entities can be displayed/.test(p),
      ),
    ).toBe(true);
  });

  it("accepts a read-only sensor entity", () => {
    expect(
      layoutProblems(
        doc([
          mod("a", "haSensor", 0, 0, 6, 2, {
            entityId: "binary_sensor.front_door",
            label: { text: "Porte" },
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("reports every problem at once rather than the first", () => {
    const problems = layoutProblems(
      doc([
        mod("a", "haSensor", 12, 0, 6, 2),
        mod("b", "teleporter", 0, 0, 4, 2),
        mod("c", "haSensor", 0, 0, 6, 2),
      ]),
    );
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe("assertValidDashboard", () => {
  it("returns the document when it is valid", () => {
    const valid = starterDashboard("Kitchen panel");
    expect(assertValidDashboard(valid)).toBe(valid);
  });

  it("throws with every problem attached", () => {
    try {
      assertValidDashboard(doc([mod("a", "haSensor", 14, 0, 6, 2)]));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DashboardValidationError);
      expect((error as DashboardValidationError).problems).toHaveLength(1);
    }
  });
});

describe("parseDashboard", () => {
  it("round-trips a serialised dashboard", () => {
    const original = starterDashboard("Kitchen panel");
    const restored = parseDashboard(JSON.parse(JSON.stringify(original)));
    expect(restored).toEqual(original);
  });

  it("rejects a v1 bare string where v2 expects a text element", () => {
    // The whole point of the v2 shape is that it is a different shape.
    // Anything still carrying v1 options has to go through the migration.
    const problems = layoutProblems(
      doc([mod("a", "haSensor", 0, 0, 6, 2, { label: "Porte" })]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/options rejected/);
  });

  it("refuses a document from a future schema version", () => {
    // 6 is the current version now; a future one is 7.
    const raw = { ...starterDashboard("x"), schema_version: 7 };
    expect(() => parseDashboard(raw)).toThrow();
  });

  it("refuses a grid that is not 16x12", () => {
    const raw = { ...starterDashboard("x"), grid: { cols: 10, rows: 6 } };
    expect(() => parseDashboard(raw)).toThrow();
  });
});

describe("normalizeDashboard", () => {
  it("fills defaults into partial options", () => {
    const normalized = normalizeDashboard(
      doc([mod("a", "calendarNext", 0, 0, 10, 4, {})]),
    );
    expect(normalized.modules[0]?.options).toEqual(
      moduleDefinition("calendarNext").schema.parse({}),
    );
  });

  it("keeps a partial text element and completes the rest of it", () => {
    const normalized = normalizeDashboard(
      doc([
        mod("a", "calendarNext", 0, 0, 10, 4, {
          heading: { text: "DEMAIN" },
        }),
      ]),
    );
    const heading = (
      normalized.modules[0]?.options as { heading: TextElement }
    ).heading;
    expect(heading.text).toBe("DEMAIN");
    expect(heading.visible).toBe(true);
    expect(heading.style.size).toBe(15);
    expect(heading.style.family).toBe("inter");
  });

  it("leaves an unknown module type untouched instead of dropping it", () => {
    const normalized = normalizeDashboard(
      doc([mod("a", "teleporter", 0, 0, 4, 2, { warp: 9 })]),
    );
    expect(normalized.modules[0]?.options).toEqual({ warp: 9 });
  });
});

describe("overlaps", () => {
  it("is false for adjacent boxes and true for shared cells", () => {
    const a = mod("a", "haSensor", 0, 0, 4, 4);
    expect(overlaps(a, mod("b", "haSensor", 4, 0, 4, 4))).toBe(false);
    expect(overlaps(a, mod("b", "haSensor", 0, 4, 4, 4))).toBe(false);
    expect(overlaps(a, mod("b", "haSensor", 2, 2, 4, 4))).toBe(true);
    expect(overlaps(a, a)).toBe(true);
  });
});

describe("findFreeSlot", () => {
  it("finds the top-left free position", () => {
    expect(findFreeSlot(emptyDashboard("x"), { w: 4, h: 4 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("skips occupied cells", () => {
    const d = doc([mod("a", "weather24h", 0, 0, 16, 6)]);
    expect(findFreeSlot(d, { w: 8, h: 6 })).toEqual({ x: 0, y: 6 });
  });

  it("returns null when the grid is full", () => {
    const d = doc([mod("a", "weather24h", 0, 0, 16, 6)]);
    expect(findFreeSlot(d, { w: 16, h: 12 })).toBeNull();
  });
});

describe("identifiers", () => {
  it("mints distinct ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newModuleId()));
    expect(ids.size).toBe(200);
    expect(newDashboardId()).toMatch(/^d_/);
    expect(newModuleId()).toMatch(/^m_/);
  });
});

describe("applyDrag", () => {
  const grid = () =>
    doc([
      mod("weather", "weather24h", 0, 0, 12, 6),
      mod("octo", "octopus", 12, 0, 4, 4),
      mod("sensor", "haSensor", 10, 6, 6, 2),
    ]);

  function moduleOf(d: DashboardDoc, id: string): ModuleInstance {
    const found = d.modules.find((m) => m.id === id);
    if (!found) throw new Error(`no module ${id}`);
    return found;
  }

  it("moves by whole cells", () => {
    const d = grid();
    const moved = applyDrag(d, moduleOf(d, "sensor"), "move", 0, 1);
    expect(moved).toMatchObject({ x: 10, y: 7, w: 6, h: 2 });
  });

  it("clamps a move at the edges of the grid", () => {
    const d = grid();
    expect(applyDrag(d, moduleOf(d, "sensor"), "move", 99, 99)).toMatchObject({
      x: 10,
      y: 10,
    });
    const alone = doc([mod("sensor", "haSensor", 10, 6, 6, 2)]);
    expect(applyDrag(alone, moduleOf(alone, "sensor"), "move", -99, -99)).toMatchObject(
      { x: 0, y: 0 },
    );
  });

  it("refuses a move that would overlap", () => {
    const d = grid();
    // Straight up into the weather block, which occupies rows 0 to 2.
    expect(applyDrag(d, moduleOf(d, "sensor"), "move", -6, -4)).toBeNull();
  });

  it("clamps a resize to the module's declared maximum", () => {
    const alone = doc([mod("sensor", "haSensor", 0, 0, 6, 2)]);
    // haSensor declares a maximum of 8x4.
    expect(applyDrag(alone, moduleOf(alone, "sensor"), "resize", 99, 99)).toMatchObject({
      w: 8,
      h: 4,
    });
  });

  it("clamps a resize to the module's declared minimum", () => {
    const alone = doc([mod("sensor", "haSensor", 0, 0, 6, 2)]);
    expect(applyDrag(alone, moduleOf(alone, "sensor"), "resize", -99, -99)).toMatchObject({
      w: 4,
      h: 2,
    });
  });

  it("stops a resize at the right edge of the grid, ahead of the declared maximum", () => {
    const alone = doc([mod("octo", "octopus", 12, 0, 4, 4)]);
    // The octopus allows 3x3, but three columns from column 6 would run past
    // the eighth. Width stops at 2 while height reaches its own maximum.
    expect(applyDrag(alone, moduleOf(alone, "octo"), "resize", 99, 99)).toMatchObject({
      w: 4,
      h: 6,
    });
  });

  it("stops a resize at the bottom edge of the grid", () => {
    const alone = doc([mod("msg", "message", 0, 10, 12, 2)]);
    // message allows 8x2, but row 5 is the last row.
    expect(applyDrag(alone, moduleOf(alone, "msg"), "resize", 99, 99)).toMatchObject({
      w: 16,
      h: 2,
    });
  });

  it("refuses a resize that would grow into a neighbour", () => {
    const d = grid();
    // Growing the octopus downward would collide with nothing, but growing the
    // weather block would run into the octopus.
    expect(applyDrag(d, moduleOf(d, "weather"), "resize", 2, 0)).toBeNull();
  });

  it("refuses to drag a module of an unknown type", () => {
    const d = doc([mod("x", "teleporter", 0, 0, 4, 2)]);
    expect(applyDrag(d, moduleOf(d, "x"), "move", 1, 0)).toBeNull();
  });
});
