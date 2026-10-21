import fs from "node:fs";
import { z } from "zod";
import type { SensorValue } from "@/core/render/data";
import { clean } from "@/core/font";
import type { ModuleData } from "@/core/render/types";
import { homeAssistantEnvPath } from "@/server/config";
import { paths } from "@/server/store/paths";
import { SourceError, fetchJson } from "./http";
import { notConfigured } from "./notConfigured";

/**
 * Home Assistant credentials, read per request from wherever the operator
 * keeps them. Nothing is copied into the tower's own store, nothing is logged,
 * and the token never crosses back over the HTTP boundary.
 *
 * Two ways in, and the process environment wins: `HASS_URL` and `HASS_TOKEN`
 * set directly, or a dotenv file named by NOTE4C_HA_ENV_PATH. The file form
 * exists because these credentials usually already live in one, and copying a
 * long-lived token into a second place is how a token outlives its rotation.
 */
export function haEnvPath(): string {
  return homeAssistantEnvPath();
}

export const STALE_AFTER_SECONDS = 3 * 60 * 60;

export const ENTITY_PATTERN = /^(sensor|binary_sensor)\.[a-z0-9_]+$/;

/** Minimal dotenv reader: KEY=VALUE, optional quotes, # comments, no expansion. */
export function parseDotenv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Name of the optional token file under <data root>/secrets (mode 600). */
export const HA_TOKEN_FILE = "home-assistant-token";

function readTokenFile(): string | undefined {
  try {
    return fs.readFileSync(paths.secret(HA_TOKEN_FILE), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface HaCredentials {
  url: string;
  token: string;
}

export function readCredentials(envPath: string = haEnvPath()): HaCredentials {
  let env: Record<string, string> = {};
  if (envPath.length > 0) {
    try {
      env = parseDotenv(fs.readFileSync(envPath, "utf8"));
    } catch {
      env = {};
    }
  }
  // Process environment wins, matching the composer's precedence. The
  // NOTE4C_-prefixed names and the token file in the data root's secrets
  // directory are the tower's own spelling; HASS_* keeps working unchanged.
  const pick = (...values: Array<string | undefined>): string | undefined =>
    values.find((v) => typeof v === "string" && v.trim().length > 0)?.trim();
  const url = pick(process.env.HASS_URL, process.env.NOTE4C_HA_URL, env.HASS_URL);
  const token = pick(
    process.env.HASS_TOKEN,
    process.env.NOTE4C_HA_TOKEN,
    env.HASS_TOKEN,
    readTokenFile(),
  );
  if (!url || !token) {
    throw new SourceError(
      notConfigured(
        `Set NOTE4C_HA_URL and NOTE4C_HA_TOKEN (or a ${HA_TOKEN_FILE} file in the secrets directory), or HASS_URL/HASS_TOKEN, or point NOTE4C_HA_ENV_PATH at a file holding them.`,
      ),
    );
  }
  return { url: url.replace(/\/+$/, ""), token };
}

/** Is Home Assistant configured at all? Never reveals the values. */
export function haConfigured(envPath: string = haEnvPath()): boolean {
  try {
    readCredentials(envPath);
    return true;
  } catch {
    return false;
  }
}

const StateSchema = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  last_updated: z.string().optional(),
  last_reported: z.string().optional(),
});
export type HaState = z.infer<typeof StateSchema>;

export function assertReadOnlyEntity(entityId: string): string {
  if (!ENTITY_PATTERN.test(entityId)) {
    throw new SourceError(
      "Only sensor. and binary_sensor. entities can be displayed",
    );
  }
  return entityId;
}

/**
 * Format one reading the way the panel expects, including the composer's
 * French words for the states that are not a number.
 */
export function formatSensor(
  state: HaState,
  now: Date,
): { value: string; stale: boolean } {
  if (state.state === "unknown") return { value: "inconnu", stale: false };
  if (state.state === "unavailable") {
    return { value: "indisponible", stale: false };
  }

  const reported = state.last_reported ?? state.last_updated;
  if (!reported) return { value: "date inconnue", stale: false };

  const observed = new Date(reported);
  if (Number.isNaN(observed.getTime())) {
    return { value: "date inconnue", stale: false };
  }

  const ageSeconds = (now.getTime() - observed.getTime()) / 1000;
  if (ageSeconds > STALE_AFTER_SECONDS) {
    return { value: "périmé", stale: true };
  }

  const unit = state.attributes?.unit_of_measurement;
  const suffix = typeof unit === "string" && unit.length > 0 ? ` ${unit}` : "";
  return { value: clean(`${state.state}${suffix}`), stale: false };
}

export async function readSensor(
  entityId: string,
  label: string,
  now: Date = new Date(),
  options: { envPath?: string } = {},
): Promise<ModuleData<SensorValue>> {
  try {
    assertReadOnlyEntity(entityId);
    const { url, token } = readCredentials(options.envPath ?? haEnvPath());
    const payload = await fetchJson(
      `${url}/api/states/${encodeURIComponent(entityId)}`,
      {
        timeoutMs: 15_000,
        headers: { authorization: `Bearer ${token}` },
      },
    );
    const parsed = StateSchema.safeParse(payload);
    if (!parsed.success) throw new SourceError("Unexpected entity shape");

    const { value, stale } = formatSensor(parsed.data, now);
    const observedAt = parsed.data.last_reported ?? parsed.data.last_updated;
    return {
      state: stale ? "stale" : "ok",
      value: { label: clean(label || entityId), value },
      ...(observedAt ? { observedAt } : {}),
    };
  } catch (error) {
    return {
      state: "unavailable",
      detail: error instanceof SourceError ? error.message : "Sensor unavailable",
    };
  }
}

/** Read every distinct entity a dashboard binds to, in one pass. */
export async function readSensors(
  bindings: Array<{ entityId: string; label: string }>,
  now: Date = new Date(),
  options: { envPath?: string } = {},
): Promise<Record<string, ModuleData<SensorValue>>> {
  const unique = new Map<string, string>();
  for (const binding of bindings) {
    if (!unique.has(binding.entityId)) {
      unique.set(binding.entityId, binding.label);
    }
  }

  const results = await Promise.all(
    [...unique.entries()].map(async ([entityId, label]) => {
      return [entityId, await readSensor(entityId, label, now, options)] as const;
    }),
  );

  return Object.fromEntries(results);
}

/* ------------------------------------------------------------------------ */
/* Bulk read: GET /api/states, once, cached briefly.                        */
/* ------------------------------------------------------------------------ */

/** Short: the picker and a render a few seconds apart share one request. */
export const STATES_TTL_MS = 30_000;
export const STATES_TIMEOUT_MS = 5_000;

let statesCache: { at: number; url: string; states: HaState[] } | null = null;

/** Test hook. */
export function resetHaStatesCache(): void {
  statesCache = null;
}

/**
 * Every entity state, read-only. One GET; never a service call. Throws a
 * SourceError (status or "Timed out", never a URL or token) on failure.
 */
export async function readAllStates(
  options: { envPath?: string; nowMs?: number; force?: boolean } = {},
): Promise<HaState[]> {
  const { url, token } = readCredentials(options.envPath ?? haEnvPath());
  const nowMs = options.nowMs ?? Date.now();
  if (
    !options.force &&
    statesCache &&
    statesCache.url === url &&
    nowMs - statesCache.at < STATES_TTL_MS
  ) {
    return statesCache.states;
  }
  const payload = await fetchJson(`${url}/api/states`, {
    timeoutMs: STATES_TIMEOUT_MS,
    headers: { authorization: `Bearer ${token}` },
  });
  const parsed = z.array(StateSchema).safeParse(payload);
  if (!parsed.success) throw new SourceError("Unexpected states shape");
  statesCache = { at: nowMs, url, states: parsed.data };
  return parsed.data;
}

/** What the inspector's picker may know about an entity: no token, no URL. */
export interface HaEntityChoice {
  entityId: string;
  name: string;
  deviceClass: string | null;
  unit: string | null;
  /** Current reading, formatted, so the picker can show what it will print. */
  value: string;
  numeric: boolean;
}

const CLASS_RANK: Record<string, number> = { temperature: 0, humidity: 1 };

/**
 * sensor.* entities, temperature first, then humidity, then any other numeric
 * sensor, then the rest. binary_sensor is left out of this picker: the tiles
 * are for readings.
 */
export function entityChoices(states: HaState[], now: Date = new Date()): HaEntityChoice[] {
  const choices = states
    .filter((s) => /^sensor\.[a-z0-9_]+$/.test(s.entity_id))
    .map((s) => {
      const attrs = s.attributes ?? {};
      const deviceClass = typeof attrs.device_class === "string" ? attrs.device_class : null;
      const unit =
        typeof attrs.unit_of_measurement === "string" && attrs.unit_of_measurement.length > 0
          ? attrs.unit_of_measurement
          : null;
      const name =
        typeof attrs.friendly_name === "string" && attrs.friendly_name.trim().length > 0
          ? attrs.friendly_name.trim()
          : s.entity_id;
      return {
        entityId: s.entity_id,
        name: clean(name),
        deviceClass,
        unit,
        value: formatSensor(s, now).value,
        numeric: s.state.trim() !== "" && Number.isFinite(Number(s.state)),
      };
    });
  const rank = (c: HaEntityChoice): number =>
    c.deviceClass && c.deviceClass in CLASS_RANK
      ? (CLASS_RANK[c.deviceClass] as number)
      : c.numeric
        ? 2
        : 3;
  return choices.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Readings for the Home sensors module, from one cached /api/states read.
 * Each entity absorbs its own failure: a missing entity is "unavailable", a
 * whole-HA failure makes every one of them unavailable with the same reason.
 */
export async function readSensorsBulk(
  entityIds: string[],
  now: Date = new Date(),
  options: { envPath?: string } = {},
): Promise<Record<string, ModuleData<SensorValue>>> {
  const ids = [...new Set(entityIds)];
  const out: Record<string, ModuleData<SensorValue>> = {};
  if (ids.length === 0) return out;
  let states: HaState[];
  try {
    states = await readAllStates({ ...options, nowMs: now.getTime() });
  } catch (error) {
    const detail = error instanceof SourceError ? error.message : "Home Assistant unavailable";
    for (const id of ids) out[id] = { state: "unavailable", detail };
    return out;
  }
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  for (const id of ids) {
    const state = ENTITY_PATTERN.test(id) ? byId.get(id) : undefined;
    if (!state) {
      out[id] = { state: "unavailable", detail: "Entity not found" };
      continue;
    }
    if (state.state === "unavailable" || state.state === "unknown") {
      out[id] = { state: "unavailable", detail: `Entity ${state.state}` };
      continue;
    }
    const { value, stale } = formatSensor(state, now);
    const observedAt = state.last_reported ?? state.last_updated;
    // Stale keeps the number (the module marks it in red with its own words)
    // instead of formatSensor's bare "périmé", so an old reading is visibly
    // old but still identifiable.
    const unit = state.attributes?.unit_of_measurement;
    const shown = stale
      ? clean(`${state.state}${typeof unit === "string" && unit.length > 0 ? ` ${unit}` : ""}`)
      : value;
    out[id] = {
      state: stale ? "stale" : "ok",
      value: { label: id, value: shown },
      ...(observedAt ? { observedAt } : {}),
    };
  }
  return out;
}
