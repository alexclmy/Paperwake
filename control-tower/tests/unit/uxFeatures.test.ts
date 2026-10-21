import { describe, expect, it } from "vitest";
import { FrameBuffer, pack } from "@/core/frame";
import { WHITE } from "@/core/palette";
import { moduleDefinition } from "@/core/render/modules";
import { emptyNoteText } from "@/core/render/modules/calendarNext";
import { weatherLine, WeatherCompactOptions } from "@/core/render/modules/weatherCompact";
import { cellsToPixels, type ModuleData } from "@/core/render/types";
import { sha256HexSync } from "@/server/hash";
import { parseOpenMeteoExtras } from "@/server/sources/openMeteo";
import { CALENDAR_OK, FIXTURE_CTX, WEATHER_OK } from "./fixtures/render";

function render(type: string, span: { w: number; h: number }, data: unknown, options: unknown = {}) {
  const def = moduleDefinition(type);
  const fb = new FrameBuffer(WHITE);
  def.render(fb, cellsToPixels(0, 0, span.w, span.h), data as ModuleData<unknown>, def.schema.parse(options), FIXTURE_CTX);
  return fb;
}
const digest = (fb: FrameBuffer) => sha256HexSync(pack(fb));
function inkRows(fb: FrameBuffer): number[] {
  const rows: number[] = [];
  for (let y = 0; y < fb.height; y += 1)
    for (let x = 0; x < fb.width; x += 1) if (fb.get(x, y) !== WHITE) { rows.push(y); break; }
  return rows;
}
function inkCols(fb: FrameBuffer): number[] {
  const cols: number[] = [];
  for (let x = 0; x < fb.width; x += 1)
    for (let y = 0; y < fb.height; y += 1) if (fb.get(x, y) !== WHITE) { cols.push(x); break; }
  return cols;
}

const NOTE = { state: "ok", value: null };

describe("message alignment", () => {
  it("a stored note without verticalAlign parses to top and renders byte-identically", () => {
    const legacy = { body: { text: "Bonjour" } };
    const explicit = { body: { text: "Bonjour" }, verticalAlign: "top" };
    expect(moduleDefinition("message").schema.parse(legacy).verticalAlign).toBe("top");
    expect(digest(render("message", { w: 8, h: 4 }, NOTE, legacy))).toBe(
      digest(render("message", { w: 8, h: 4 }, NOTE, explicit)),
    );
  });

  it("centres horizontally and vertically when asked", () => {
    const top = render("message", { w: 16, h: 6 }, NOTE, { body: { text: "Hi" } });
    const mid = render("message", { w: 16, h: 6 }, NOTE, {
      body: { text: "Hi", style: { align: "center" } },
      verticalAlign: "middle",
    });
    const bottom = render("message", { w: 16, h: 6 }, NOTE, { body: { text: "Hi" }, verticalAlign: "bottom" });
    const [t0] = inkRows(top);
    const [m0] = inkRows(mid);
    const [b0] = inkRows(bottom);
    expect(m0!).toBeGreaterThan(t0!);
    expect(b0!).toBeGreaterThan(m0!);
    const cols = inkCols(mid);
    const centre = (cols[0]! + cols[cols.length - 1]!) / 2;
    expect(Math.abs(centre - cellsToPixels(0, 0, 16, 6).w / 2)).toBeLessThan(6);
  });
});

describe("calendar", () => {
  it("never claims a horizon it does not know", () => {
    expect(emptyNoteText("sur les 366 prochains jours", undefined)).toBe("pour le moment");
    expect(emptyNoteText("sur les 366 prochains jours", 14)).toBe("sur les 14 prochains jours");
    expect(emptyNoteText("sur les {jours} prochains jours", 14)).toBe("sur les 14 prochains jours");
    expect(emptyNoteText("Rien de prévu", 14)).toBe("Rien de prévu");
  });

  it("list is the default variant, so stored compositions are unchanged", () => {
    expect(moduleDefinition("calendarNext").schema.parse({}).variant).toBe("list");
    expect(digest(render("calendarNext", { w: 10, h: 4 }, CALENDAR_OK, {}))).toBe(
      digest(render("calendarNext", { w: 10, h: 4 }, CALENDAR_OK, { variant: "list" })),
    );
  });

  it("compact variants draw something different, inside the tile", () => {
    const list = digest(render("calendarNext", { w: 10, h: 4 }, CALENDAR_OK));
    for (const variant of ["oneLine", "twoLines"]) {
      const fb = render("calendarNext", { w: 10, h: 4 }, CALENDAR_OK, { variant });
      expect(digest(fb)).not.toBe(list);
      const rows = inkRows(fb);
      expect(rows[rows.length - 1]!).toBeLessThan(cellsToPixels(0, 0, 10, 4).h);
    }
  });
});

describe("weather extras", () => {
  const now = new Date("2026-10-21T06:00:00Z");
  const hours = Array.from({ length: 26 }, (_, i) => new Date(now.getTime() + i * 3_600_000).toISOString().slice(0, 16));
  const payload = {
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, i) => 8 + i / 4),
      weather_code: hours.map(() => 3),
      apparent_temperature: hours.map((_, i) => 5 + i / 4),
      precipitation_probability: hours.map(() => 40),
    },
    current: { temperature_2m: 9.2, apparent_temperature: 6.1, weather_code: 3, wind_speed_10m: 18.4, wind_direction_10m: 270 },
  };

  it("reads feels-like, wind and rain, and a morning/midday/evening summary", () => {
    const extras = parseOpenMeteoExtras(payload, now, "Europe/Paris");
    expect(extras.now).toEqual({ temp: 9, condition: "cloudy", apparent: 6, windKmh: 18, windDirDeg: 270, precipProb: 40 });
    expect(extras.dayParts?.map((p) => p.label)).toEqual(["Matin", "Midi", "Soir"]);
  });

  it("leaves out what the source did not give, never a zero", () => {
    const bare = { hourly: { time: hours, temperature_2m: hours.map(() => 9), weather_code: hours.map(() => 3) } };
    const extras = parseOpenMeteoExtras(bare, now, "Europe/Paris");
    expect(extras.now).toEqual({ temp: 9, condition: "cloudy" });
    const line = weatherLine({ ...WEATHER_OK.value, ...extras } as never, WeatherCompactOptions.parse({}));
    expect(line).toBe("9° nuageux");
  });

  it("builds the one-line summary and honours each toggle", () => {
    const value = { ...WEATHER_OK.value, ...parseOpenMeteoExtras(payload, now, "Europe/Paris") } as never;
    expect(weatherLine(value, WeatherCompactOptions.parse({}))).toBe("9° nuageux · ressenti 6° · vent 18 km/h O · pluie 40 %");
    expect(weatherLine(value, WeatherCompactOptions.parse({ showWind: false, showRain: false }))).toBe("9° nuageux · ressenti 6°");
  });

  it("existing weather modules ignore the new fields", () => {
    const extras = parseOpenMeteoExtras(payload, now, "Europe/Paris");
    for (const type of ["weather24h", "weatherHero", "weatherWeek"]) {
      const before = digest(render(type, { w: 16, h: 4 }, WEATHER_OK));
      const after = digest(render(type, { w: 16, h: 4 }, { ...WEATHER_OK, value: { ...WEATHER_OK.value, ...extras } }));
      expect(after).toBe(before);
    }
  });

  it("the compact module renders both formats within the tile", () => {
    const data = { ...WEATHER_OK, value: { ...WEATHER_OK.value, ...parseOpenMeteoExtras(payload, now, "Europe/Paris") } };
    const one = render("weatherCompact", { w: 16, h: 2 }, data);
    const two = render("weatherCompact", { w: 16, h: 4 }, data, { format: "dayParts" });
    expect(digest(one)).not.toBe(digest(two));
    expect(inkRows(two).length).toBeGreaterThan(inkRows(one).length);
  });
});
