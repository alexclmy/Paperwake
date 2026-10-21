import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameBuffer, pack } from "@/core/frame";
import { RED } from "@/core/palette";
import { moduleDefinition } from "@/core/render/modules";
import { cellsToPixels, type ModuleData } from "@/core/render/types";
import { renderDashboard } from "@/core/render";
import { sha256HexSync } from "@/server/hash";
import { WeatherCompactOptions, weatherLine } from "@/core/render/modules/weatherCompact";
import { HomeSensorsOptions, homeSensorRows } from "@/core/render/modules/homeSensors";
import {
  entityChoices,
  readAllStates,
  readCredentials,
  readSensorsBulk,
  resetHaStatesCache,
  HA_TOKEN_FILE,
} from "@/server/sources/haSensor";
import { sourceBindings } from "@/server/sources";
import { FIXTURE_CTX, WEATHER_OK } from "./fixtures/render";

const NOW = new Date("2026-10-21T10:00:00.000Z");

const WEATHER = {
  state: "ok" as const,
  value: {
    ...WEATHER_OK.value,
    now: { temp: 12, condition: "sunny", apparent: 10, windKmh: 5, windDirDeg: 315, precipProb: 0 },
    dayParts: [
      { label: "Matin", temp: 4, condition: "sunny", precipProb: 0 },
      { label: "Midi", temp: 2, condition: "cloudy", precipProb: 2 },
      { label: "Soir", temp: 7, condition: "clear-night", precipProb: 0 },
    ],
  },
};

function render(type: string, span: { w: number; h: number }, data: ModuleData<unknown>, options: Record<string, unknown> = {}) {
  const def = moduleDefinition(type);
  const fb = new FrameBuffer();
  const rect = cellsToPixels(0, 0, span.w, span.h);
  def.render(fb, rect, data, def.schema.parse(options), FIXTURE_CTX);
  return fb;
}
const digest = (fb: FrameBuffer) => sha256HexSync(pack(fb));
function inkRows(fb: FrameBuffer): number[] {
  const rows: number[] = [];
  for (let y = 0; y < fb.height; y += 1) {
    for (let x = 0; x < fb.width; x += 1) {
      if (fb.pixels[y * fb.width + x] !== 1) {
        rows.push(y);
        break;
      }
    }
  }
  return rows;
}

describe("weatherCompact: every field is its own toggle", () => {
  it("a stored module without the new keys renders exactly as before", () => {
    // Legacy stored options: what every existing composition holds.
    const legacy = { format: "dayParts", showFeelsLike: true, showWind: true, showRain: true, showDaySummary: true };
    const parsed = WeatherCompactOptions.parse(legacy);
    expect(parsed.showCurrent).toBe(true);
    expect(parsed.showPartTemp).toBe(true);
    expect(parsed.showPartRain).toBeUndefined();
    expect(parsed.partRainLabel).toBeUndefined();
    // Bare "2%" under each part, following showRain, as it always did.
    const withRain = render("weatherCompact", { w: 16, h: 4 }, WEATHER, legacy);
    const explicit = render("weatherCompact", { w: 16, h: 4 }, WEATHER, { ...legacy, showPartRain: true, partRainLabel: "percent" });
    expect(digest(withRain)).toBe(digest(explicit));
    const noRain = render("weatherCompact", { w: 16, h: 4 }, WEATHER, { ...legacy, showRain: false });
    const noRainExplicit = render("weatherCompact", { w: 16, h: 4 }, WEATHER, { ...legacy, showRain: false, showPartRain: false });
    expect(digest(noRain)).toBe(digest(noRainExplicit));
  });

  it("current temp+condition can be hidden on its own", () => {
    const opts = WeatherCompactOptions.parse({ showCurrent: false });
    expect(weatherLine(WEATHER.value as never, opts)).toBe("ressenti 10° · vent 5 km/h NO · pluie 0 %");
  });

  it("all line-1 fields off: no line, the day summary moves up", () => {
    const off = { showCurrent: false, showFeelsLike: false, showWind: false, showRain: false };
    expect(weatherLine(WEATHER.value as never, WeatherCompactOptions.parse(off))).toBe("");
    const full = render("weatherCompact", { w: 16, h: 4 }, WEATHER, { format: "dayParts" });
    const only = render("weatherCompact", { w: 16, h: 4 }, WEATHER, { format: "dayParts", ...off, showPartRain: true });
    expect(inkRows(only)[0]).toBeLessThan(inkRows(full)[0]! + 1);
    // Day-summary-only fits in a single row now that line 1 is gone.
    const oneRow = render("weatherCompact", { w: 16, h: 2 }, WEATHER, { format: "dayParts", ...off, showPartRain: true });
    expect(inkRows(oneRow).length).toBeGreaterThan(10);
  });

  it("day-summary temperature and rain chance toggle independently", () => {
    const base = { format: "dayParts", showPartRain: true, partRainLabel: "percent" };
    const a = digest(render("weatherCompact", { w: 16, h: 4 }, WEATHER, base));
    const b = digest(render("weatherCompact", { w: 16, h: 4 }, WEATHER, { ...base, showPartTemp: false }));
    const c = digest(render("weatherCompact", { w: 16, h: 4 }, WEATHER, { ...base, showPartRain: false }));
    const d = digest(render("weatherCompact", { w: 16, h: 4 }, WEATHER, { ...base, partRainLabel: "drop" }));
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it("new tiles default to the self-explaining rain-drop label", () => {
    const defaults = moduleDefinition("weatherCompact").defaultOptions as Record<string, unknown>;
    expect(defaults.partRainLabel).toBe("drop");
    expect(defaults.showPartRain).toBe(true);
  });
});

describe("homeSensors module", () => {
  const readings: Record<string, ModuleData<{ label: string; value: string }>> = {
    "sensor.salon_temperature": { state: "ok", value: { label: "x", value: "21.3 °C" } },
    "sensor.salon_humidity": { state: "stale", value: { label: "x", value: "48 %" } },
    "sensor.cave_temperature": { state: "unavailable", detail: "Entity unavailable" },
  };
  const entities = [
    { entityId: "sensor.salon_temperature", label: "Salon", name: "Salon Temperature" },
    { entityId: "sensor.salon_humidity", label: "", name: "Salon Humidity" },
    { entityId: "sensor.cave_temperature", label: "Cave" },
  ];

  it("labels, stale and unavailable are honest", () => {
    const rows = homeSensorRows(HomeSensorsOptions.parse({ entities }), readings);
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Salon", "21.3 °C"],
      ["Salon Humidity", "48 % périmé"],
      ["Cave", "indisponible"],
    ]);
    expect(rows[1]!.colour).toBe(RED);
    expect(rows[2]!.colour).toBe(RED);
  });

  it("refuses non-sensor entities", () => {
    expect(HomeSensorsOptions.safeParse({ entities: [{ entityId: "light.kitchen" }] }).success).toBe(false);
    expect(HomeSensorsOptions.safeParse({ entities: [{ entityId: "switch.x" }] }).success).toBe(false);
  });

  it("renders all three formats within the tile and differently", () => {
    const data = { state: "ok" as const, value: { readings } };
    const digests = ["list", "compact", "tiles"].map((format) =>
      digest(render("homeSensors", { w: 8, h: 4 }, data, { format, entities })),
    );
    expect(new Set(digests).size).toBe(3);
  });

  it("a dashboard binds its entities and receives their readings", () => {
    const doc = {
      schema_version: 3,
      modules: [{ id: "h", type: "homeSensors", x: 0, y: 0, w: 8, h: 4, options: HomeSensorsOptions.parse({ entities }) }],
    } as never;
    expect(sourceBindings(doc).bulkSensors).toEqual(entities.map((e) => e.entityId));
    const result = renderDashboard(doc, { weather: { state: "unavailable" }, calendar: { state: "unavailable" }, reminders: { state: "unavailable" }, sensors: readings } as never, FIXTURE_CTX);
    expect(result).toBeTruthy();
  });
});

describe("Home Assistant bulk read (mocked fetch)", () => {
  let scratch: string;
  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ha-"));
    vi.stubEnv("NOTE4C_TOWER_DATA_DIR", scratch);
    vi.stubEnv("HASS_URL", "");
    vi.stubEnv("HASS_TOKEN", "");
    vi.stubEnv("NOTE4C_HA_ENV_PATH", "");
    vi.stubEnv("NOTE4C_HA_URL", "http://ha.local:8123/");
    vi.stubEnv("NOTE4C_HA_TOKEN", "supersecret");
    resetHaStatesCache();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  const fresh = new Date(NOW.getTime() - 60_000).toISOString();
  const STATES = [
    { entity_id: "sensor.power", state: "120", attributes: { unit_of_measurement: "W", friendly_name: "Power" }, last_reported: fresh },
    { entity_id: "sensor.salon_humidity", state: "48", attributes: { device_class: "humidity", unit_of_measurement: "%", friendly_name: "Salon humidity" }, last_reported: fresh },
    { entity_id: "sensor.salon_temperature", state: "21.3", attributes: { device_class: "temperature", unit_of_measurement: "°C", friendly_name: "Salon temperature" }, last_reported: fresh },
    { entity_id: "sensor.cave_temperature", state: "unavailable", attributes: { device_class: "temperature" }, last_reported: fresh },
    { entity_id: "sensor.old", state: "9", attributes: { device_class: "temperature", unit_of_measurement: "°C" }, last_reported: "2026-10-20T00:00:00.000Z" },
    { entity_id: "sensor.firmware", state: "v1.2", attributes: {} },
    { entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen" } },
  ];

  function mockStates(body: unknown = STATES, status = 200) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      }),
    );
    return calls;
  }

  it("reads NOTE4C_HA_URL / NOTE4C_HA_TOKEN, GET /api/states with Bearer, read-only", async () => {
    const calls = mockStates();
    await readAllStates({ nowMs: NOW.getTime() });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://ha.local:8123/api/states");
    expect(calls[0]!.init?.method).toBe("GET");
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer supersecret");
  });

  it("caches for a short TTL", async () => {
    const calls = mockStates();
    await readAllStates({ nowMs: NOW.getTime() });
    await readAllStates({ nowMs: NOW.getTime() + 5_000 });
    expect(calls).toHaveLength(1);
    await readAllStates({ nowMs: NOW.getTime() + 60_000 });
    expect(calls).toHaveLength(2);
  });

  it("reads the token from <data root>/secrets when no env token", async () => {
    vi.stubEnv("NOTE4C_HA_TOKEN", "");
    fs.mkdirSync(path.join(scratch, "secrets"), { recursive: true });
    fs.writeFileSync(path.join(scratch, "secrets", HA_TOKEN_FILE), "filetoken\n", { mode: 0o600 });
    expect(readCredentials("").token).toBe("filetoken");
  });

  it("lists sensor.* only, temperature then humidity then numeric", () => {
    const choices = entityChoices(STATES as never, NOW);
    expect(choices).toHaveLength(6);
    expect(choices.slice(0, 3).every((c) => c.deviceClass === "temperature")).toBe(true);
    expect(choices[3]!.deviceClass).toBe("humidity");
    expect(choices[4]!.entityId).toBe("sensor.power");
    expect(choices.at(-1)!.entityId).toBe("sensor.firmware");
    expect(JSON.stringify(choices)).not.toContain("supersecret");
    expect(choices.some((c) => c.entityId.startsWith("light."))).toBe(false);
  });

  it("maps readings: ok, stale with value, unavailable, missing", async () => {
    mockStates();
    const out = await readSensorsBulk(
      ["sensor.salon_temperature", "sensor.old", "sensor.cave_temperature", "sensor.nope"],
      NOW,
    );
    expect(out["sensor.salon_temperature"]).toMatchObject({ state: "ok", value: { value: "21.3 °C" } });
    expect(out["sensor.old"]).toMatchObject({ state: "stale", value: { value: "9 °C" } });
    expect(out["sensor.cave_temperature"]!.state).toBe("unavailable");
    expect(out["sensor.nope"]).toMatchObject({ state: "unavailable", detail: "Entity not found" });
  });

  it("HA down: every entity unavailable, detail never leaks the token or URL", async () => {
    mockStates({ message: "no" }, 401);
    const out = await readSensorsBulk(["sensor.salon_temperature"], NOW);
    expect(out["sensor.salon_temperature"]).toEqual({ state: "unavailable", detail: "HTTP 401" });
    expect(JSON.stringify(out)).not.toContain("supersecret");
    expect(JSON.stringify(out)).not.toContain("ha.local");
  });

  it("not configured: unavailable without any request", async () => {
    vi.stubEnv("NOTE4C_HA_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await readSensorsBulk(["sensor.salon_temperature"], NOW);
    expect(out["sensor.salon_temperature"]!.state).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
