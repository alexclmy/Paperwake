/**
 * Is automatic refresh actually going to keep the panel current?
 *
 * Pure, shared by the server (scheduler log, status route) and the UI (Home
 * card, editor banner). The incident this exists for: the selected composition
 * had no interval, so the scheduler returned "disabled" every tick, silently,
 * while the panel showed day-old data. Every way that can happen is named here
 * with a plain sentence and, where there is one, a one-click fix.
 */

export const AUTO_REFRESH_INTERVALS = [5, 15, 30, 60, 180] as const;
export type AutoRefreshInterval = (typeof AUTO_REFRESH_INTERVALS)[number];
export const DEFAULT_AUTO_REFRESH_MIN: AutoRefreshInterval = 60;

/** Why the scheduler will not refresh, or null when it will. */
export type DisabledReason =
  | "no_selection"
  | "missing"
  | "archived"
  | "no_interval"
  | null;

export interface AutoRefreshInput {
  selectedId: string | null;
  /** Null when the selected id no longer resolves to a record. */
  selected: {
    id: string;
    title: string;
    status: "active" | "archived";
    intervalMinutes: number | null;
  } | null;
  lastAt: string | null;
  lastDashboardId: string | null;
  lastOutcome: string | null;
  /** The device's wake cycle in minutes, best known. */
  wakeIntervalMin: number;
  /** The scheduler only ever pushes to the real panel. */
  deviceMode: "real" | "mock";
  now: Date;
}

export type WarningCode =
  | DisabledReason
  | "last_failed"
  | "last_blocked"
  | "stale";

export interface AutoRefreshWarning {
  code: Exclude<WarningCode, null>;
  message: string;
  /** The one-click fix, when there is one. */
  fix: { label: string; intervalMinutes: AutoRefreshInterval } | null;
}

export function disabledReason(input: Pick<AutoRefreshInput, "selectedId" | "selected">): DisabledReason {
  if (!input.selectedId) return "no_selection";
  if (!input.selected) return "missing";
  if (input.selected.status !== "active") return "archived";
  if (input.selected.intervalMinutes === null) return "no_interval";
  return null;
}

export const DISABLED_SENTENCE: Record<Exclude<DisabledReason, null>, string> = {
  no_selection: "No composition is chosen, so the panel won't update on its own.",
  missing: "The chosen composition was deleted, so the panel won't update on its own.",
  archived: "The chosen composition is archived, so the panel won't update on its own.",
  no_interval: "Auto-refresh is off, so the panel won't update on its own.",
};

/** The newest acceptable age of the last refresh, in ms. */
export function staleAfterMs(intervalMinutes: number, wakeIntervalMin: number): number {
  return (2 * intervalMinutes + wakeIntervalMin) * 60_000;
}

export function assessAutoRefresh(input: AutoRefreshInput): AutoRefreshWarning | null {
  const reason = disabledReason(input);
  const fix = { label: `Refresh every ${DEFAULT_AUTO_REFRESH_MIN} min`, intervalMinutes: DEFAULT_AUTO_REFRESH_MIN };
  if (reason === "no_interval") return { code: reason, message: DISABLED_SENTENCE[reason], fix };
  if (reason !== null) return { code: reason, message: DISABLED_SENTENCE[reason], fix: null };

  const selected = input.selected!;
  const interval = selected.intervalMinutes!;
  // The mock is never refreshed by the scheduler; its record says nothing.
  if (input.deviceMode !== "real") return null;
  const mine = input.lastDashboardId === selected.id;
  if (mine && input.lastOutcome === "failed") {
    return {
      code: "last_failed",
      message: "The last automatic refresh failed: the sources could not be read or the frame could not be rendered. It retries within 5 minutes.",
      fix: null,
    };
  }
  if (mine && input.lastOutcome === "blocked") {
    return {
      code: "last_blocked",
      message: "Automatic refresh is waiting: an earlier manual send was never confirmed by the panel. Resolve it on Home to let refreshes through.",
      fix: null,
    };
  }
  if (mine && input.lastAt) {
    const age = input.now.getTime() - Date.parse(input.lastAt);
    if (Number.isFinite(age) && age > staleAfterMs(interval, input.wakeIntervalMin)) {
      return {
        code: "stale",
        message: `The last automatic refresh is older than expected for “every ${interval} min” plus one panel wake cycle. The tower may have been stopped, or the panel has not woken.`,
        fix: null,
      };
    }
  }
  return null;
}
