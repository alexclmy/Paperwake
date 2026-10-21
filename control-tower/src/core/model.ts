import { z } from "zod";
import { GRID_COLS, GRID_ROWS, GRID_SCALE } from "./render/types";
import { MODULES, isKnownModuleType, moduleDefinition } from "./render/modules";
import { migrateDashboardDoc } from "./migrate";
import { DEFAULT_THEME, DashboardThemeSchema } from "./theme";

/**
 * 3 adds the dashboard theme: content padding, dashboard typography and the
 * palette policy. 4 records the refresh interval explicitly. 5 adds the theme's
 * Expression block — colour use, brush, pixel texture, larger text. Every field
 * of every one of these defaults to the value that reproduces what the previous
 * version painted, so each migration is additive and invisible.
 * 6 moves the layout from an 8x6 grid to 16x12; see migrateDashboardDocV5toV6.
 */
export const DASHBOARD_SCHEMA_VERSION = 6;

export const RefreshIntervalSchema = z.union([
  z.null(), z.literal(5), z.literal(15), z.literal(30), z.literal(60), z.literal(180),
]);

/**
 * A module's frame: the hairline rules that delimit it on the panel.
 *
 * Modules tile the grid edge to edge with no gutter, so two adjacent blocks
 * abut and read as one field. A single black rule on the shared edge is what
 * turns them into two legible regions — a column rule, the newspaper move. It
 * lives on the instance, not in module options, because it is chrome that any
 * module can wear, not data any one module owns; the compositor draws it after
 * the module paints. See src/core/render/frame.ts for how it is stroked.
 */
export const FRAME_EDGES = ["top", "right", "bottom", "left"] as const;
export const ModuleFrameSchema = z.object({
  edges: z.array(z.enum(FRAME_EDGES)).max(4).default([]),
  weight: z.number().int().min(1).max(4).default(2),
  style: z.enum(["solid", "dashed", "dotted"]).default("solid"),
  inset: z.number().min(0).max(0.45).default(0),
  // Palette index; black (0) by design — the one pigment the palette policy
  // never disables, so a rule survives a black-and-white theme unchanged.
  color: z.number().int().min(0).max(3).default(0),
});
export type ModuleFrame = z.infer<typeof ModuleFrameSchema>;

export const ModuleInstanceSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  x: z.number().int().min(0).max(GRID_COLS - 1),
  y: z.number().int().min(0).max(GRID_ROWS - 1),
  w: z.number().int().min(1).max(GRID_COLS),
  h: z.number().int().min(1).max(GRID_ROWS),
  /**
   * Hidden modules keep their place on the grid and their options, and draw
   * nothing. This is the difference between "not today" and "gone": deleting
   * a module throws away its wording, and hiding it does not.
   */
  hidden: z.boolean().default(false),
  options: z.record(z.string(), z.unknown()).default({}),
  /** Optional hairline rules delimiting this module. Omitted = no frame. */
  frame: ModuleFrameSchema.optional(),
});
export type ModuleInstance = z.infer<typeof ModuleInstanceSchema>;

export const GridSchema = z.object({
  cols: z.literal(GRID_COLS),
  rows: z.literal(GRID_ROWS),
});

export const DashboardDocSchema = z.object({
  schema_version: z.literal(DASHBOARD_SCHEMA_VERSION),
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  status: z.enum(["active", "archived"]),
  grid: GridSchema,
  /**
   * Dashboard-wide theme. Defaulted rather than required so a version saved
   * before themes existed still parses, and so the default is stored once at
   * the boundary instead of being re-derived at every render.
   */
  theme: DashboardThemeSchema.default({}),
  /** Null keeps all refreshes and pushes manual. */
  refreshIntervalMinutes: RefreshIntervalSchema,
  modules: z.array(ModuleInstanceSchema).max(24),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DashboardDoc = z.infer<typeof DashboardDocSchema>;

export class DashboardValidationError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Dashboard layout is not valid: ${problems.join("; ")}`);
    this.name = "DashboardValidationError";
    this.problems = problems;
  }
}

export function overlaps(a: ModuleInstance, b: ModuleInstance): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/**
 * Structural rules the schema alone cannot express: modules must fit the
 * grid, must not overlap, must be a known type, must respect their declared
 * spans, and must carry options their own schema accepts.
 *
 * Overlap is prevented at the model level rather than resolved at render
 * time, so a saved version can never paint a module the designer did not
 * show.
 */
export function layoutProblems(doc: DashboardDoc): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();

  for (const module of doc.modules) {
    if (seenIds.has(module.id)) {
      problems.push(`Duplicate module id "${module.id}"`);
    }
    seenIds.add(module.id);

    if (!isKnownModuleType(module.type)) {
      problems.push(`Unknown module type "${module.type}"`);
      continue;
    }

    const definition = moduleDefinition(module.type);

    if (module.x + module.w > doc.grid.cols || module.y + module.h > doc.grid.rows) {
      problems.push(
        `Module "${module.id}" (${module.type}) runs past the ${doc.grid.cols}x${doc.grid.rows} grid`,
      );
    }
    if (module.w < definition.minSpan.w || module.h < definition.minSpan.h) {
      problems.push(
        `Module "${module.id}" is smaller than ${module.type} allows (minimum ${definition.minSpan.w}x${definition.minSpan.h})`,
      );
    }
    if (module.w > definition.maxSpan.w || module.h > definition.maxSpan.h) {
      problems.push(
        `Module "${module.id}" is larger than ${module.type} allows (maximum ${definition.maxSpan.w}x${definition.maxSpan.h})`,
      );
    }

    const options = definition.schema.safeParse(module.options);
    if (!options.success) {
      problems.push(
        `Module "${module.id}" (${module.type}) options rejected: ${options.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
          .join(", ")}`,
      );
    }
  }

  for (let i = 0; i < doc.modules.length; i += 1) {
    for (let j = i + 1; j < doc.modules.length; j += 1) {
      const a = doc.modules[i] as ModuleInstance;
      const b = doc.modules[j] as ModuleInstance;
      if (overlaps(a, b)) {
        problems.push(`Modules "${a.id}" and "${b.id}" overlap`);
      }
    }
  }

  return problems;
}

export function assertValidDashboard(doc: DashboardDoc): DashboardDoc {
  const problems = layoutProblems(doc);
  if (problems.length > 0) throw new DashboardValidationError(problems);
  return doc;
}

export function parseDashboard(raw: unknown): DashboardDoc {
  return assertValidDashboard(
    DashboardDocSchema.parse(migrateDashboardDoc(raw)),
  );
}

/**
 * Fill each module's options through its own schema so defaults are applied
 * once, at the boundary, rather than re-derived at every render.
 */
export function normalizeDashboard(doc: DashboardDoc): DashboardDoc {
  return {
    ...doc,
    modules: doc.modules.map((module) => {
      if (!isKnownModuleType(module.type)) return module;
      const definition = moduleDefinition(module.type);
      const parsed = definition.schema.safeParse(module.options);
      return { ...module, options: parsed.success ? (parsed.data as Record<string, unknown>) : module.options };
    }),
  };
}

export type DragMode = "move" | "resize";

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Where a drag of dx, dy whole cells would put a module.
 *
 * All the designer's geometry lives here rather than in the component, so the
 * rules are testable without a browser and the same clamps apply however the
 * drag arrives (mouse, touch, or a future keyboard nudge).
 *
 * Returns null when the result would overlap another module: overlap is
 * prevented at the model level, so a colliding drag simply does not land and a
 * saved version can never paint a module the designer did not show.
 */
export function applyDrag(
  doc: DashboardDoc,
  origin: ModuleInstance,
  mode: DragMode,
  dx: number,
  dy: number,
): ModuleInstance | null {
  if (!isKnownModuleType(origin.type)) return null;
  const definition = moduleDefinition(origin.type);

  let next: ModuleInstance;
  if (mode === "move") {
    next = {
      ...origin,
      x: clamp(origin.x + dx, 0, doc.grid.cols - origin.w),
      y: clamp(origin.y + dy, 0, doc.grid.rows - origin.h),
    };
  } else {
    next = {
      ...origin,
      w: clamp(
        origin.w + dx,
        definition.minSpan.w,
        Math.min(definition.maxSpan.w, doc.grid.cols - origin.x),
      ),
      h: clamp(
        origin.h + dy,
        definition.minSpan.h,
        Math.min(definition.maxSpan.h, doc.grid.rows - origin.y),
      ),
    };
  }

  const collides = doc.modules.some(
    (other) => other.id !== next.id && overlaps(other, next),
  );
  return collides ? null : next;
}

export { spanFitsAt };

/** Does a module of this type fit anywhere free on the grid? */
export function findFreeSlot(
  doc: DashboardDoc,
  span: { w: number; h: number },
): { x: number; y: number } | null {
  for (let y = 0; y + span.h <= doc.grid.rows; y += 1) {
    for (let x = 0; x + span.w <= doc.grid.cols; x += 1) {
      const candidate: ModuleInstance = {
        id: "__probe__",
        type: "__probe__",
        x,
        y,
        w: span.w,
        h: span.h,
        hidden: false,
        options: {},
      };
      if (!doc.modules.some((module) => overlaps(module, candidate))) {
        return { x, y };
      }
    }
  }
  return null;
}

function spanFitsAt(
  doc: DashboardDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  ignoreId?: string,
): boolean {
  if (x < 0 || y < 0 || x + w > doc.grid.cols || y + h > doc.grid.rows) return false;
  const probe: ModuleInstance = {
    id: "__probe__", type: "__probe__", x, y, w, h, hidden: false, options: {},
  };
  return !doc.modules.some((m) => m.id !== ignoreId && overlaps(m, probe));
}

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the block landed smaller than the size it asked for. */
  shrunk: boolean;
}

/**
 * Where a new block of this type should go, and how big it can be.
 *
 * The preferred span is tried first, in reading order. When no free spot holds
 * it, every span between the module's minimum and the preferred span is tried,
 * largest area first, so a block that would fit once shrunk is never refused.
 * Null means not even the minimum fits anywhere: the caller has to say so.
 */
export function findPlacement(
  doc: DashboardDoc,
  type: string,
  preferred?: { w: number; h: number },
): Placement | null {
  if (!isKnownModuleType(type)) return null;
  const definition = moduleDefinition(type);
  const want = {
    w: clamp(preferred?.w ?? definition.defaultSpan.w, definition.minSpan.w, Math.min(definition.maxSpan.w, doc.grid.cols)),
    h: clamp(preferred?.h ?? definition.defaultSpan.h, definition.minSpan.h, Math.min(definition.maxSpan.h, doc.grid.rows)),
  };
  const exact = findFreeSlot(doc, want);
  if (exact) return { ...exact, ...want, shrunk: false };

  const spans: { w: number; h: number }[] = [];
  for (let w = want.w; w >= definition.minSpan.w; w -= 1) {
    for (let h = want.h; h >= definition.minSpan.h; h -= 1) {
      if (w === want.w && h === want.h) continue;
      spans.push({ w, h });
    }
  }
  // Largest area first; on a tie keep the aspect closest to the wanted one.
  const aspect = want.w / want.h;
  spans.sort(
    (a, b) =>
      b.w * b.h - a.w * a.h ||
      Math.abs(a.w / a.h - aspect) - Math.abs(b.w / b.h - aspect),
  );
  for (const span of spans) {
    const slot = findFreeSlot(doc, span);
    if (slot) return { ...slot, ...span, shrunk: true };
  }
  return null;
}

/** The one message for a block that has nowhere to go. */
export const NO_ROOM_MESSAGE = "No room left: shrink or remove a block";

/**
 * Re-pack every block top to bottom in rows, keeping their order.
 *
 * Blocks are taken in reading order (top, then left) and laid left to right;
 * a block that does not fit the rest of the row starts a new one. Each row is
 * as tall as its tallest block, and the last block of every row grows to fill
 * the width (up to its own maximum). A block that would run off the bottom is
 * shrunk toward its minimum height; when even that does not fit, the pack is
 * refused (null) rather than producing an overlap.
 */
export function autoLayout(doc: DashboardDoc): DashboardDoc | null {
  const ordered = [...doc.modules].sort((a, b) => a.y - b.y || a.x - b.x);
  const cols = doc.grid.cols;
  const rowsOut: ModuleInstance[][] = [];
  let row: ModuleInstance[] = [];
  let used = 0;
  for (const module of ordered) {
    const def = isKnownModuleType(module.type) ? moduleDefinition(module.type) : null;
    const minW = def?.minSpan.w ?? 1;
    const w = clamp(module.w, minW, cols);
    if (used + w > cols && row.length > 0) {
      rowsOut.push(row);
      row = [];
      used = 0;
    }
    row.push({ ...module, w });
    used += w;
  }
  if (row.length > 0) rowsOut.push(row);

  // Heights: each row is as tall as its tallest block; if the stack overruns
  // the grid, rows give height back down to their tallest minimum.
  const minH = (m: ModuleInstance) =>
    isKnownModuleType(m.type) ? moduleDefinition(m.type).minSpan.h : 1;
  const maxH = (m: ModuleInstance) =>
    isKnownModuleType(m.type) ? moduleDefinition(m.type).maxSpan.h : doc.grid.rows;
  const heights = rowsOut.map((r) => Math.max(...r.map((m) => m.h)));
  const floors = rowsOut.map((r) => Math.max(...r.map(minH)));
  let total = heights.reduce((a, b) => a + b, 0);
  while (total > doc.grid.rows) {
    let best = -1;
    for (let i = 0; i < heights.length; i += 1) {
      if ((heights[i] as number) > (floors[i] as number) && (best < 0 || (heights[i] as number) > (heights[best] as number))) best = i;
    }
    if (best < 0) return null;
    heights[best] = (heights[best] as number) - 1;
    total -= 1;
  }

  const out: ModuleInstance[] = [];
  let y = 0;
  rowsOut.forEach((r, index) => {
    const rowH = heights[index] as number;
    let x = 0;
    r.forEach((module, i) => {
      const def = isKnownModuleType(module.type) ? moduleDefinition(module.type) : null;
      const maxW = def?.maxSpan.w ?? cols;
      const isLast = i === r.length - 1;
      const w = isLast ? clamp(cols - x, module.w, Math.min(maxW, cols - x)) : module.w;
      const h = clamp(rowH, minH(module), Math.min(maxH(module), rowH));
      out.push({ ...module, x, y, w, h });
      x += w;
    });
    y += rowH;
  });

  // Keep the document's own module order, only geometry changes.
  const byId = new Map(out.map((m) => [m.id, m]));
  return { ...doc, modules: doc.modules.map((m) => byId.get(m.id) ?? m) };
}

export function newModuleId(): string {
  return `m_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function newDashboardId(): string {
  return `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function emptyDashboard(title: string, now: Date = new Date()): DashboardDoc {
  const stamp = now.toISOString();
  return {
    schema_version: DASHBOARD_SCHEMA_VERSION,
    id: newDashboardId(),
    title,
    status: "active",
    grid: { cols: GRID_COLS, rows: GRID_ROWS },
    theme: DEFAULT_THEME,
    refreshIntervalMinutes: null,
    modules: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/**
 * A sensible first dashboard: the panel the composer paints today,
 * modularised.
 *
 * The calendar tile is three rows rather than two, because the v2 defaults set
 * event titles at 15 px and wrap them to two lines, and two events at that
 * size need the extra row. Laying it out to fit is better than laying it out
 * to overflow and relying on the warning: defaults that warn on first run
 * teach the reader to ignore warnings.
 *
 * The bottom right 3x1 is left free on purpose, so there is somewhere for the
 * first module the owner adds to land.
 */
export function starterDashboard(title: string, now: Date = new Date()): DashboardDoc {
  const doc = emptyDashboard(title, now);
  const place = (
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): ModuleInstance => ({
    // Laid out in the coarse 8x6 coordinates it was designed in, scaled to
    // the 16x12 grid: the same pixels as ever.
    id: newModuleId(),
    type,
    x: x * GRID_SCALE,
    y: y * GRID_SCALE,
    w: w * GRID_SCALE,
    h: h * GRID_SCALE,
    hidden: false,
    options: { ...(MODULES[type]?.defaultOptions as Record<string, unknown>) },
  });

  return {
    ...doc,
    modules: [
      place("weather24h", 0, 0, 6, 3),
      place("octopus", 6, 0, 2, 2),
      place("haSensor", 6, 2, 2, 1),
      place("calendarNext", 0, 3, 5, 3),
      place("message", 5, 3, 3, 1),
      place("timestamp", 5, 4, 3, 1),
    ],
  };
}
