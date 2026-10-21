import { describe, expect, it } from "vitest";
import { pack } from "@/core/frame";
import { renderDashboard, renderDashboardWithReport } from "@/core/render";
import {
  PANEL_STRINGS,
  PANEL_STRING_KEYS,
  compass,
  localizeDefault,
  localizeOptions,
  pt,
} from "@/core/render/i18n";
import { eventWhen } from "@/core/render/modules/calendarNext";
import { weatherLine } from "@/core/render/modules/weatherCompact";
import { WeatherCompactOptions } from "@/core/render/modules/weatherCompact";
import { MODULE_TYPES, moduleDefinition } from "@/core/render/modules";
import type { DashboardDoc } from "@/core/model";
import type { DashboardSources } from "@/core/render/data";
import { sha256HexSync } from "@/server/hash";
import { CALENDAR_OK, FIXTURE_CTX, WEATHER_OK, fixtureSources, noSources } from "./fixtures/render";

const WEATHER_RICH = {
  state: "ok",
  value: {
    ...WEATHER_OK.value,
    now: { temp: 12, condition: "partlycloudy", apparent: 9, windKmh: 18, windDirDeg: 315, precipProb: 40 },
    dayParts: [
      { label: "Matin", temp: 9, condition: "cloudy", precipProb: 10 },
      { label: "Midi", temp: 15, condition: "partlycloudy", precipProb: 30 },
      { label: "Soir", temp: 11, condition: "rainy", precipProb: 60 },
    ],
  },
} as const;

function sources(): DashboardSources {
  return { ...fixtureSources(), weather: WEATHER_RICH as unknown as DashboardSources["weather"] };
}

function weatherCalendarDoc(): DashboardDoc {
  return {
    schema_version: 2,
    name: "Weather + calendar",
    modules: [
      { id: "w", type: "weatherCompact", x: 0, y: 0, w: 16, h: 4, options: { format: "dayParts" } },
      { id: "c", type: "calendarNext", x: 0, y: 4, w: 16, h: 6, options: { maxEvents: 2 } },
      { id: "t", type: "timestamp", x: 10, y: 10, w: 6, h: 2, options: {} },
    ],
  } as unknown as DashboardDoc;
}

const digest = (doc: DashboardDoc, s: DashboardSources, lang?: "fr" | "en") =>
  sha256HexSync(pack(renderDashboard(doc, s, { ...FIXTURE_CTX, ...(lang ? { lang } : {}) })));

describe("panel string dictionary", () => {
  it("has every key in both languages, none empty", () => {
    for (const lang of ["fr", "en"] as const) {
      const table = PANEL_STRINGS[lang];
      expect(Object.keys(table).sort()).toEqual([...PANEL_STRING_KEYS].sort());
      for (const key of PANEL_STRING_KEYS) expect(table[key].trim().length, `${lang}:${key}`).toBeGreaterThan(0);
    }
  });

  it("keeps placeholders identical across languages", () => {
    const holes = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort().join(",");
    for (const key of PANEL_STRING_KEYS) expect(holes(PANEL_STRINGS.en[key]), key).toBe(holes(PANEL_STRINGS.fr[key]));
  });

  it("translates compass points", () => {
    expect(compass(315, "fr")).toBe("NO");
    expect(compass(315, "en")).toBe("NW");
    expect(compass(225, "en")).toBe("SW");
    expect(compass(270, "fr")).toBe("O");
  });

  it("never translates the owner's words", () => {
    expect(localizeDefault("Réunion budget", "en")).toBe("Réunion budget");
    expect(localizeDefault("À VENIR", "en")).toBe("UPCOMING");
    const opts = { heading: { text: "Mon agenda", visible: true }, rows: [{ text: "LISTE" }] };
    expect(localizeOptions(opts, "en")).toBe(opts);
  });
});

describe("French stays byte-identical", () => {
  it("lang 'fr' and no lang render the same bytes", () => {
    const doc = weatherCalendarDoc();
    expect(digest(doc, sources(), "fr")).toBe(digest(doc, sources()));
    expect(digest(doc, noSources(), "fr")).toBe(digest(doc, noSources()));
  });

  it("every module's default render is identical with lang fr", () => {
    for (const type of MODULE_TYPES) {
      const def = moduleDefinition(type);
      const doc = {
        schema_version: 2,
        name: type,
        modules: [{ id: "m", type, x: 0, y: 0, ...def.defaultSpan, options: def.defaultOptions }],
      } as unknown as DashboardDoc;
      expect(digest(doc, fixtureSources(), "fr"), type).toBe(digest(doc, fixtureSources()));
    }
  });
});

describe("English panel", () => {
  it("writes the compact weather line in English", () => {
    const line = weatherLine(
      WEATHER_RICH.value as never,
      WeatherCompactOptions.parse({}),
      "en",
    );
    expect(line).toBe("12° partly cloudy · feels 9° · wind 18 km/h NW · rain 40 %");
    expect(weatherLine(WEATHER_RICH.value as never, WeatherCompactOptions.parse({}))).toBe(
      "12° éclaircies · ressenti 9° · vent 18 km/h NO · pluie 40 %",
    );
  });

  it("re-derives calendar times in English", () => {
    const [timed, allDay] = CALENDAR_OK.value.events;
    expect(eventWhen(timed, "America/Toronto", "en")).toBe("Sep 11 09:00");
    expect(eventWhen(allDay, "America/Toronto", "en")).toBe("Sep 12 · all day");
    expect(eventWhen(timed, "America/Toronto", "fr")).toBe(timed.when);
  });

  it("changes the pixels of every module with default copy", () => {
    const doc = weatherCalendarDoc();
    expect(digest(doc, sources(), "en")).not.toBe(digest(doc, sources()));
    expect(digest(doc, noSources(), "en")).not.toBe(digest(doc, noSources()));
  });

  it("fits at 400x300: no overflow in any default module, both languages", () => {
    for (const lang of ["fr", "en"] as const) {
      for (const [doc, s] of [
        [weatherCalendarDoc(), sources()],
        [weatherCalendarDoc(), noSources()],
      ] as const) {
        const { report } = renderDashboardWithReport(doc, s, { ...FIXTURE_CTX, lang });
        expect(report.overflows, lang).toEqual([]);
      }
      for (const type of MODULE_TYPES) {
        const def = moduleDefinition(type);
        const doc = {
          schema_version: 2,
          name: type,
          modules: [{ id: "m", type, x: 0, y: 0, ...def.defaultSpan, options: def.defaultOptions }],
        } as unknown as DashboardDoc;
        const fr = renderDashboardWithReport(doc, fixtureSources(), FIXTURE_CTX).report.overflows.length;
        const en = renderDashboardWithReport(doc, fixtureSources(), { ...FIXTURE_CTX, lang }).report.overflows.length;
        // English may never overflow where French did not.
        expect(en, `${lang}:${type}`).toBeLessThanOrEqual(fr);
      }
    }
  });

  it("matches the English golden for weather + calendar", () => {
    expect({
      ok: digest(weatherCalendarDoc(), sources(), "en"),
      down: digest(weatherCalendarDoc(), noSources(), "en"),
    }).toMatchInlineSnapshot(`
      {
        "down": "07934498272f03551315ac8a3fa66eb544c628739838c905e9b618bc22e6d70c",
        "ok": "2fca5819c62486bf808e58a5315a2ceb9f0dcfc5c4f379c6854709e9469e6e69",
      }
    `);
  });

  it("uses English unit words and moon names", () => {
    expect(pt("en", "unit.days")).toBe("days");
    expect(pt("en", "moon.full")).toBe("Full moon");
  });
});
