"use client";

import { useEffect, useRef, useState } from "react";
import {
  AUTO_REFRESH_INTERVALS,
  DEFAULT_AUTO_REFRESH_MIN,
  assessAutoRefresh,
  type AutoRefreshInput,
  type AutoRefreshWarning,
} from "@/core/autoRefresh";
import { ApiError, apiGet, apiSend } from "./api";
import { Button } from "./components";

/**
 * Auto-refresh, made visible: which composition the scheduler keeps on the
 * panel, how often, when it last ran — and a loud banner with a one-click fix
 * whenever it is not actually going to run.
 */

export interface AutoRefreshPayload {
  selectedId: string | null;
  title: string | null;
  status: "active" | "archived" | null;
  disabledReason: string | null;
  wakeIntervalMin: number;
  intervalMinutes: number | null;
  lastAt: string | null;
  lastDashboardId: string | null;
  lastOutcome: string | null;
}

interface Summary {
  id: string;
  title: string;
  status: "active" | "archived";
  refreshIntervalMinutes: number | null;
}

export function toAssessInput(
  auto: AutoRefreshPayload,
  deviceMode: "real" | "mock",
  now = new Date(),
): AutoRefreshInput {
  return {
    selectedId: auto.selectedId,
    selected:
      auto.selectedId && auto.title !== null && auto.status !== null
        ? { id: auto.selectedId, title: auto.title, status: auto.status, intervalMinutes: auto.intervalMinutes }
        : null,
    lastAt: auto.lastAt,
    lastDashboardId: auto.lastDashboardId,
    lastOutcome: auto.lastOutcome,
    wakeIntervalMin: auto.wakeIntervalMin,
    deviceMode,
    now,
  };
}

/** PATCH helpers. Same session + CSRF guard as every other mutation. */
export async function setAutoRefresh(id: string, intervalMinutes: number | null, select = true): Promise<void> {
  await apiSend(`/api/dashboards/${id}`, "PATCH", {
    refreshIntervalMinutes: intervalMinutes,
    ...(select ? { selected: true } : {}),
  });
}

export function AutoRefreshBanner({
  warning,
  dashboardId,
  onFixed,
  testId = "auto-refresh-warning",
}: {
  warning: AutoRefreshWarning;
  dashboardId: string | null;
  onFixed: () => void;
  testId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="auto-refresh-banner" role="alert" data-testid={testId} data-code={warning.code}>
      <span className="auto-refresh-banner-flag" aria-hidden="true">!</span>
      <p>{warning.message}</p>
      {warning.fix && dashboardId && (
        <Button
          variant="primary"
          className="btn-sm"
          disabled={busy}
          testId={`${testId}-fix`}
          onClick={() => {
            setBusy(true);
            setError("");
            void setAutoRefresh(dashboardId, warning.fix!.intervalMinutes)
              .then(onFixed)
              .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Could not turn auto-refresh on"))
              .finally(() => setBusy(false));
          }}
        >
          {warning.fix.label}
        </Button>
      )}
      {error && <span className="error-note">{error}</span>}
    </div>
  );
}

/**
 * The Home chip: "Auto · 60 min" (or "Auto · off"). One click opens a small
 * popover with the two controls that matter — which composition, how often.
 */
export function AutoRefreshChip({
  auto,
  onChanged,
}: {
  auto: AutoRefreshPayload;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Summary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    void apiGet<{ dashboards: Summary[] }>("/api/dashboards")
      .then((payload) => setList(payload.dashboards.filter((d) => d.status === "active")))
      .catch(() => setList([]));
  }, [open, auto.selectedId, auto.intervalMinutes]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = auto.disabledReason === null;
  const intervals = AUTO_REFRESH_INTERVALS.filter((m) => m !== 5 || auto.intervalMinutes === 5);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The change could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="auto-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="auto-chip"
        data-active={active || undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="auto-refresh-chip"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="auto-chip-icon" aria-hidden="true">↻</span>
        <span data-testid="auto-refresh-summary">
          Auto · {active ? `${auto.intervalMinutes} min` : "off"}
        </span>
      </button>
      {open && (
        <div className="auto-popover" role="dialog" aria-label="Auto-refresh" data-testid="auto-refresh-popover">
          <p className="auto-popover-title">Keep the panel up to date</p>
          <label className="auto-popover-field">
            <span>Composition</span>
            <select
              value={auto.selectedId ?? ""}
              disabled={busy || list.length === 0}
              data-testid="auto-refresh-composition"
              onChange={(event) => {
                const id = event.target.value;
                if (!id) return;
                const target = list.find((d) => d.id === id);
                void run(() =>
                  setAutoRefresh(id, target?.refreshIntervalMinutes ?? auto.intervalMinutes ?? DEFAULT_AUTO_REFRESH_MIN),
                );
              }}
            >
              {!auto.selectedId && <option value="">Choose…</option>}
              {list.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>
          <div className="auto-popover-field">
            <span>Every</span>
            <div className="segmented" role="group" aria-label="Refresh interval" data-testid="auto-refresh-interval">
              <button
                type="button"
                aria-pressed={auto.intervalMinutes === null}
                disabled={busy || !auto.selectedId || auto.status !== "active"}
                className="btn"
                data-testid="auto-refresh-off"
                onClick={() => auto.selectedId && void run(() => setAutoRefresh(auto.selectedId!, null))}
              >
                Off
              </button>
              {intervals.map((m) => (
                <button
                  type="button"
                  key={m}
                  aria-pressed={auto.intervalMinutes === m}
                  disabled={busy || !auto.selectedId || auto.status !== "active"}
                  className="btn"
                  data-testid={`auto-refresh-${m}`}
                  onClick={() => auto.selectedId && void run(() => setAutoRefresh(auto.selectedId!, m))}
                >
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="error-note">{error}</p>}
        </div>
      )}
    </span>
  );
}

/**
 * The editor's copy of the banner: shown only on the composition the
 * scheduler is meant to keep on the panel.
 */
export function EditorAutoRefreshBanner({
  dashboardId,
  onFixed,
}: {
  dashboardId: string;
  onFixed: (intervalMinutes: number) => void;
}) {
  const [payload, setPayload] = useState<{ autoRefresh: AutoRefreshPayload; deviceMode: string } | null>(null);
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    void apiGet<{ autoRefresh: AutoRefreshPayload; deviceMode: string }>("/api/overview")
      .then(setPayload)
      .catch(() => setPayload(null));
  }, [dashboardId, stamp]);
  if (!payload || payload.autoRefresh.selectedId !== dashboardId) return null;
  const warning = assessAutoRefresh(
    toAssessInput(payload.autoRefresh, payload.deviceMode === "real" ? "real" : "mock"),
  );
  if (!warning) return null;
  return (
    <AutoRefreshBanner
      warning={warning}
      dashboardId={dashboardId}
      testId="editor-auto-refresh-warning"
      onFixed={() => {
        onFixed(warning.fix?.intervalMinutes ?? DEFAULT_AUTO_REFRESH_MIN);
        setStamp((s) => s + 1);
      }}
    />
  );
}

/**
 * After a successful manual send: offer to keep that composition current.
 * Reads the record itself so it works from every place the send dialog opens.
 */
export function KeepUpToDate({ dashboardId }: { dashboardId: string }) {
  const [state, setState] = useState<{ selected: boolean; interval: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      apiGet<{ selectedDashboardId: string | null }>("/api/state"),
      apiGet<{ record: { doc: { refreshIntervalMinutes: number | null } } }>(`/api/dashboards/${dashboardId}`),
    ])
      .then(([s, r]) =>
        setState({ selected: s.selectedDashboardId === dashboardId, interval: r.record.doc.refreshIntervalMinutes }),
      )
      .catch(() => setState(null));
  }, [dashboardId]);

  if (!state) return null;
  if (state.selected && state.interval !== null) {
    return (
      <p className="send-toast-keep" data-testid="keep-up-to-date-already">
        Already kept up to date · refreshes every {state.interval} min
      </p>
    );
  }
  return (
    <div className="send-toast-keep">
      <span>Refresh this on the panel automatically?</span>
      <Button
        className="btn-sm"
        disabled={busy}
        testId="keep-up-to-date"
        onClick={() => {
          setBusy(true);
          const interval = state.interval ?? DEFAULT_AUTO_REFRESH_MIN;
          void setAutoRefresh(dashboardId, interval)
            .then(() => setState({ selected: true, interval }))
            .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Could not turn auto-refresh on"))
            .finally(() => setBusy(false));
        }}
      >
        Keep it up to date
      </Button>
      {error && <span className="error-note">{error}</span>}
    </div>
  );
}
