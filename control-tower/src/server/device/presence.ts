import type { DeviceStatus } from "./client";

/**
 * What the scheduler's presence watch last saw, held in this process only.
 *
 * WHY THIS EXISTS
 * ---------------
 * The tower used to knock on the panel only when it had something to give it
 * (a queued frame, a pending power change). With nothing pending, a person
 * could press BOOT, watch the panel wake, and see the header keep saying the
 * device was asleep — nobody was asking. After a switch to Balanced, which is
 * exactly when there is nothing pending, that read as "the device is gone".
 *
 * So the scheduler now also looks, at a gentle pace, when idle (see
 * `runFastCatchTick`). This costs the panel nothing: asleep, its radio is off
 * and the connect never reaches it; awake, a status read does not extend its
 * window (only a physical press does, firmware `NotePhysicalActivity`).
 *
 * The browser reads this memory through `/api/device/status?observe=presence`,
 * which opens no socket: a tab left open polls the tower, never the device.
 */
export interface Presence {
  /** When the probe finished, server clock. The ordering key for the UI. */
  at: string;
  reachable: boolean;
  /** The device's answer, when it gave one. */
  status: DeviceStatus | null;
}

const KEY = Symbol.for("note4c.devicePresence");
type PresenceGlobal = typeof globalThis & { [KEY]?: Presence | null };

export function recordPresence(presence: Presence): void {
  const scope = globalThis as PresenceGlobal;
  const known = scope[KEY];
  if (known && Date.parse(known.at) > Date.parse(presence.at)) return;
  // One line per change of state, never per probe: enough to see a wake and
  // a sleep in the server log, too little to be noise.
  if (!known || known.reachable !== presence.reachable) {
    console.info(`[presence] ${presence.at} device ${presence.reachable ? "answering" : "silent"}`);
  }
  scope[KEY] = presence;
}

export function readPresence(): Presence | null {
  return (globalThis as PresenceGlobal)[KEY] ?? null;
}

/** Test seam. */
export function resetPresenceForTests(): void {
  (globalThis as PresenceGlobal)[KEY] = null;
}
