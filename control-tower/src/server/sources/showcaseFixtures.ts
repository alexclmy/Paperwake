import type { DashboardSources } from "@/core/render/data";

/**
 * The showcase data set: the fictional sources behind the README pictures.
 *
 * Used by tools/showcase.ts (panel renders) and, when both
 * NOTE4C_TOWER_E2E=1 and NOTE4C_TOWER_SHOWCASE=1 are set, by the tower itself
 * so `npm run screenshots` photographs the same household as the renders.
 * Everything here is invented: a Lisbon forecast, a made-up agenda, sensors
 * with room names and nothing else.
 */

/** Thursday 22 October 2026, 07:45 in Lisbon. */
export const SHOWCASE_NOW = new Date("2026-10-22T06:45:00.000Z");
export const SHOWCASE_TZ = "Europe/Lisbon";
const observedAt = SHOWCASE_NOW.toISOString();

const ev = (title: string, start: string, end: string, when: string) => ({ title, start, end, when });

export const SHOWCASE_SOURCES: DashboardSources = {
  weather: {
    state: "ok",
    observedAt,
    value: {
      slots: [
        { time: "08h", temp: 15, condition: "partlycloudy" },
        { time: "14h", temp: 22, condition: "sunny" },
        { time: "20h", temp: 18, condition: "cloudy" },
        { time: "02h", temp: 14, condition: "clear-night" },
      ],
      low: 14,
      high: 23,
      hours: 24,
      unit: "°C",
      locationLabel: "Lisbon",
      locationWarning: false,
      condition: "partlycloudy",
      isDay: true,
      now: { temp: 15, condition: "partlycloudy", apparent: 14, windKmh: 12, windDirDeg: 315, precipProb: 10 },
      dayParts: [
        { label: "Morning", temp: 16, condition: "partlycloudy", precipProb: 10 },
        { label: "Midday", temp: 22, condition: "sunny", precipProb: 0 },
        { label: "Evening", temp: 18, condition: "cloudy", precipProb: 20 },
      ],
      days: [
        { label: "THU", condition: "partlycloudy", high: 23, low: 14 },
        { label: "FRI", condition: "sunny", high: 24, low: 15 },
        { label: "SAT", condition: "sunny", high: 25, low: 15 },
        { label: "SUN", condition: "rainy", high: 19, low: 13 },
        { label: "MON", condition: "cloudy", high: 20, low: 13 },
        { label: "TUE", condition: "partlycloudy", high: 21, low: 14 },
        { label: "WED", condition: "sunny", high: 22, low: 14 },
      ],
    },
  },
  calendar: {
    state: "ok",
    observedAt,
    value: {
      events: [
        ev("Design review", "2026-10-22T09:00:00.000Z", "2026-10-22T10:00:00.000Z", "22/10 10:00"),
        ev("Gym", "2026-10-22T17:30:00.000Z", "2026-10-22T18:30:00.000Z", "22/10 18:30"),
        ev("Dinner with Sam", "2026-10-22T19:30:00.000Z", "2026-10-22T21:30:00.000Z", "22/10 20:30"),
        ev("Farmers' market", "2026-10-24T00:00:00.000Z", "2026-10-25T00:00:00.000Z", "24/10 · all day"),
      ],
    },
  },
  sensors: {
    "sensor.living_room_temperature": { state: "ok", observedAt, value: { label: "Living room", value: "21.4 °C" } },
    "sensor.living_room_humidity": { state: "ok", observedAt, value: { label: "Humidity", value: "42 %" } },
    "sensor.bedroom_temperature": { state: "ok", observedAt, value: { label: "Bedroom", value: "19.8 °C" } },
    "sensor.outdoor_temperature": { state: "ok", observedAt, value: { label: "Outdoor", value: "15.2 °C" } },
    "sensor.office_co2": { state: "ok", observedAt, value: { label: "Office CO2", value: "612 ppm" } },
  },
  reminders: {
    state: "ok",
    observedAt,
    value: { openCount: 4, overdueCount: 1, listName: "Home" },
  },
};


/** The Home Assistant entities the inspector's picker lists in a showcase run. */
export const SHOWCASE_HA_ENTITIES = [
  { entityId: "sensor.living_room_temperature", name: "Living room temperature", deviceClass: "temperature", unit: "°C", value: "21.4 °C", numeric: true },
  { entityId: "sensor.living_room_humidity", name: "Living room humidity", deviceClass: "humidity", unit: "%", value: "42 %", numeric: true },
  { entityId: "sensor.bedroom_temperature", name: "Bedroom temperature", deviceClass: "temperature", unit: "°C", value: "19.8 °C", numeric: true },
  { entityId: "sensor.bedroom_humidity", name: "Bedroom humidity", deviceClass: "humidity", unit: "%", value: "47 %", numeric: true },
  { entityId: "sensor.outdoor_temperature", name: "Outdoor temperature", deviceClass: "temperature", unit: "°C", value: "15.2 °C", numeric: true },
  { entityId: "sensor.office_co2", name: "Office CO2", deviceClass: "carbon_dioxide", unit: "ppm", value: "612 ppm", numeric: true },
];

export function isShowcase(): boolean {
  return process.env.NOTE4C_TOWER_SHOWCASE === "1";
}
