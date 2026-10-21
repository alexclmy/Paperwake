import { NextResponse } from "next/server";
import { guarded } from "@/server/auth/guard";
import { isE2E } from "@/server/sources/e2eFixtures";
import { isShowcase, SHOWCASE_HA_ENTITIES } from "@/server/sources/showcaseFixtures";
import {
  entityChoices,
  haConfigured,
  readAllStates,
  type HaEntityChoice,
} from "@/server/sources/haSensor";
import { SourceError } from "@/server/sources/http";
import { isNotConfigured } from "@/server/sources/notConfigured";

export const dynamic = "force-dynamic";

/**
 * The inspector's entity picker for the Home sensors module.
 *
 * Session-guarded like every other route. Read-only: one cached GET
 * /api/states against Home Assistant, never a service call. The response
 * carries entity ids, names, classes, units and formatted readings, and never
 * the Home Assistant URL or token; failures say only "not configured",
 * an HTTP status, or "Timed out".
 */
const E2E_ENTITIES: HaEntityChoice[] = [
  { entityId: "sensor.example_temperature", name: "Hallway temperature", deviceClass: "temperature", unit: "°C", value: "19.4 °C", numeric: true },
  { entityId: "sensor.example_humidity", name: "Hallway humidity", deviceClass: "humidity", unit: "%", value: "48 %", numeric: true },
];

export const GET = guarded({}, async () => {
  if (isE2E()) {
    return NextResponse.json({ configured: true, state: "ok", entities: isShowcase() ? SHOWCASE_HA_ENTITIES : E2E_ENTITIES });
  }
  if (!haConfigured()) {
    return NextResponse.json({ configured: false, state: "not_configured", entities: [] });
  }
  try {
    const states = await readAllStates();
    return NextResponse.json({ configured: true, state: "ok", entities: entityChoices(states) });
  } catch (error) {
    const detail = error instanceof SourceError ? error.message : "Home Assistant unavailable";
    return NextResponse.json({
      configured: !isNotConfigured(detail),
      state: "unavailable",
      detail,
      entities: [],
    });
  }
});
