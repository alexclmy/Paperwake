"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { assessAutoRefresh } from "@/core/autoRefresh";
import { deriveDeviceState, type DevicePower } from "@/core/power";
import { ApiError, apiGet, apiSend, relativeTime, usePolledResource } from "@/ui/api";
import { Button, ErrorNote } from "@/ui/components";
import { PageError, PageLoading } from "@/ui/PageState";
import { useRegisterPageDeviceState } from "@/ui/pageDeviceState";
import { ScaledPanel } from "@/ui/ScaledPanel";
import { SendFlowDialog } from "@/ui/SendFlowDialog";
import { HomeGallery } from "@/ui/HomeGallery";
import {
  AutoRefreshBanner,
  AutoRefreshChip,
  toAssessInput,
  type AutoRefreshPayload,
} from "@/ui/AutoRefresh";
import { TemplatePicker } from "@/ui/TemplatePicker";
import { useToast } from "@/ui/Toast";
import { usePanelLang } from "@/ui/panelLang";
import { publishDeviceStatus, toDeviceReading } from "@/ui/useDeviceState";
import { PANEL_TIMEZONE } from "@/core/render/time";

interface SourceRow {
  key: string;
  label: string;
  state: "ok" | "stale" | "unavailable" | "not_configured";
  observedAt: string | null;
  detail: string | null;
}

interface PushRecord {
  pushId: string;
  state: string;
  first: { at: string; dashboardId: string; dashboardTitle: string; version: number; sha256: string };
  latest: {
    at: string;
    detail: string | null;
    seq: number | null;
    panelMs: number | null;
    /** Wire attempts that did not land. Zero for a push nobody has tried yet. */
    attempts?: number;
  };
}

interface OverviewPayload {
  readAt: string;
  /**
   * When the device and the sources were actually read. Not the same fact.
   *
   * Null when they have not been read yet — see `observed`. The page renders
   * that as "not read yet" rather than as a timestamp, because a freshness
   * stamp on a reading that does not exist is exactly the claim this product
   * refuses to make.
   */
  observedAt: string | null;
  observationStale: boolean;
  snapshotTtlMs: number;
  simulated: boolean;
  tokenConfigured: boolean;
  deviceMode: "mock" | "real";
  deviceAddress: string | null;
  /**
   * Whether the device and the sources below were read at all.
   *
   * False on the first response after a restart, while the read that will
   * replace them runs behind it. Everything else in this payload is local and
   * is as fresh as `readAt` either way, which is why the page renders from it
   * immediately instead of holding a skeleton until a panel answers.
   */
  observed: boolean;
  /** True when a read was started behind this response. */
  refreshing: boolean;
  device:
    | {
        observed: true;
        reachable: true;
        status: {
          firmware: string;
          api: number;
          provisioned: boolean;
          lockdown: boolean;
          stored: { present: boolean; seq: number; sha256: string };
          displayed: { present: boolean; seq: number; sha256: string };
          refresh: { state: string; pending: boolean };
          timing_ms?: Record<string, number>;
        };
      }
    | { observed: boolean; reachable: false; detail: string };
  displayedMatch: { dashboardId?: string; dashboardTitle: string; version: number } | null;
  storedMatch: { dashboardTitle: string; version: number } | null;
  storedEqualsDisplayed: boolean;
  selected: { id: string; title: string; latestVersion: number } | null;
  autoRefresh: AutoRefreshPayload;
  pending: { sha256: string; wouldDedup: boolean } | null;
  sources: SourceRow[];
  composer:
    | { state: "running"; status: Record<string, unknown>; observedAt: string }
    | { state: "not_running" | "unreadable" | "not_configured"; detail: string };
  /** What the device last said, and when. See src/core/power.ts. */
  lastConfirmed: {
    at: string;
    power: DevicePower | null;
    powerSupported: boolean | null;
  } | null;
  blocking: PushRecord | null;
  lastPush: PushRecord | null;
  dashboardCount: number;
  /** The hybrid power block, so the state words agree across pages. */
  power?: DevicePower | null;
  powerSupported?: boolean | null;
  powerIntent?: unknown;
  nextWake?: { at: string; estimated: boolean } | null;
  deviceLastSeenAt?: string | null;
}

interface StatePayload {
  firstRunCompletedAt: string | null;
}

/**
 * How often the tower is re-read while this tab is in front.
 *
 * Sixty seconds, and it re-reads the *tower* only. The poll is sent without
 * `force=1`, which on `/api/overview` means it is answered from a snapshot
 * the server already holds: no socket at the panel, no forecast fetch, no
 * Home Assistant call, no `remindctl` process. That distinction is the whole
 * reason the snapshot exists — this used to do all four, once a minute, for
 * as long as a tab was open.
 *
 * When the snapshot is older than its own TTL the server answers from it
 * anyway and refreshes behind the response, so a poll never waits on a device
 * either. What the page owes the reader in exchange is the honest age of the
 * reading, which is why `observedAt` is rendered next to the panel and is not
 * the same field as `readAt`.
 */
const POLL_MS = 60_000;

interface CompositionSummary {
  id: string;
  title: string;
  status: "active" | "archived";
}

/** "~20:10" in the panel's time zone, or "in 40 min" when it is close. */
function humanWake(iso: string, now = Date.now()): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = t - now;
  if (diff < 0) return null;
  if (diff < 60 * 60_000) return `in ${Math.max(1, Math.round(diff / 60_000))} min`;
  const time = new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PANEL_TIMEZONE,
  });
  return `~${time}`;
}

function KeyIcon({ name }: { name: "battery" | "wake" | "update" | "sources" }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;
  if (name === "battery")
    return <svg {...common}><rect x="1.5" y="4.5" width="11" height="7" rx="1.5" /><path d="M14.5 7v2" strokeLinecap="round" /></svg>;
  if (name === "wake")
    return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" /></svg>;
  if (name === "update")
    return <svg {...common}><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg {...common}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" strokeLinecap="round" /></svg>;
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Home: what is on the panel, and one way to change it.
 *
 * Deliberately nothing else. The device's state lives in the header chip
 * (one place, every page); wake schedule, Check now, interactive mode,
 * sources, sequence numbers and the send ledger live on Device and Advanced.
 */
export default function OverviewPage() {
  const overview = usePolledResource<OverviewPayload>("/api/overview", POLL_MS, {
    settling: (payload) => !payload.observed,
    settleMs: 1_000,
  });
  const data = overview.data;
  const toast = useToast();
  const { lang: panelLang } = usePanelLang();

  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [frameStamp, setFrameStamp] = useState(() => Date.now());
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [compositions, setCompositions] = useState<CompositionSummary[]>([]);

  useRegisterPageDeviceState();

  useEffect(() => {
    if (!data) return;
    publishDeviceStatus({
      reachable: data.device.reachable,
      observed: data.device.observed,
      simulated: data.simulated,
      deviceMode: data.deviceMode,
      deviceAddress: data.deviceAddress,
      power: data.power,
      powerSupported: data.powerSupported ?? null,
      powerIntent: data.powerIntent,
      nextWake: data.nextWake ?? null,
      deviceLastSeenAt: data.deviceLastSeenAt ?? null,
      lastConfirmed: data.lastConfirmed ?? null,
      readAt: data.observedAt ?? undefined,
    });
  }, [data]);

  useEffect(() => {
    void (async () => {
      try {
        const state = await apiGet<StatePayload>("/api/state");
        setFirstRun(state.firstRunCompletedAt === null);
      } catch {
        setFirstRun(false);
      }
    })();
  }, []);

  const selectedKey = data?.selected?.id ?? null;
  const countKey = data?.dashboardCount ?? 0;
  useEffect(() => {
    void apiGet<{ dashboards: CompositionSummary[] }>("/api/dashboards")
      .then((payload) => setCompositions(payload.dashboards.filter((d) => d.status === "active")))
      .catch(() => setCompositions([]));
  }, [selectedKey, countKey]);

  async function dismissFirstRun(): Promise<void> {
    setFirstRun(false);
    try {
      await apiSend("/api/state", "PATCH", { firstRunCompleted: true });
    } catch {
      // Dismissed locally either way.
    }
  }

  async function choose(id: string): Promise<void> {
    setActionError("");
    try {
      await apiSend(`/api/dashboards/${id}`, "PATCH", { selected: true });
      await overview.reload();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "Selection failed");
    }
  }

  async function resolveBlocking(
    action: "recheck" | "acknowledge" | "deliver" | "cancel",
  ): Promise<void> {
    if (!data?.blocking) return;
    setBusy(true);
    setActionError("");
    try {
      const response = await apiSend<{ state: string; detail: string }>(
        `/api/device/push/${data.blocking.pushId}`,
        "POST",
        { action },
      );
      toast(
        action === "cancel"
          ? "Send cancelled — nothing was sent"
          : action === "acknowledge"
            ? "Marked as resolved"
            : `${response.state.replace(/_/g, " ")} — ${response.detail}`,
      );
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "The tower did not answer");
    } finally {
      setBusy(false);
      setFrameStamp(Date.now());
      await overview.reload();
    }
  }

  if (!data) {
    return (
      <>
        <div className="page-head">
          <h1>Home</h1>
        </div>
        {overview.error ? (
          <PageError message={overview.error} onRetry={() => void overview.reload()} />
        ) : (
          <PageLoading label="Loading your panel." />
        )}
      </>
    );
  }

  const reachable = data.device.reachable;
  const status = reachable ? data.device.status : null;
  const reading = toDeviceReading({
    reachable,
    observed: data.device.observed,
    simulated: data.simulated,
    deviceMode: data.deviceMode,
    deviceAddress: data.deviceAddress,
    power: data.power,
    powerSupported: data.powerSupported ?? null,
    powerIntent: data.powerIntent,
    nextWake: data.nextWake ?? null,
    deviceLastSeenAt: data.deviceLastSeenAt ?? null,
    lastConfirmed: data.lastConfirmed ?? null,
    readAt: data.observedAt ?? undefined,
  });
  const state = deriveDeviceState(reading.input);

  const queued = data.blocking?.state === "queued" ? data.blocking : null;
  const unresolved = data.blocking && data.blocking.state !== "queued" ? data.blocking : null;

  const hasFrame = reachable && status?.displayed.present === true;
  const lastSent = data.lastPush;

  // What the hero shows, in order of truth: the device's own frame, else the
  // last composition sent from here, else nothing yet.
  type Hero =
    | { kind: "frame"; title: string | null }
    | { kind: "last-sent"; id: string; version: number; title: string }
    | { kind: "empty" };
  const hero: Hero = hasFrame
    ? { kind: "frame", title: data.displayedMatch?.dashboardTitle ?? null }
    : lastSent
      ? {
          kind: "last-sent",
          id: lastSent.first.dashboardId,
          version: lastSent.first.version,
          title: lastSent.first.dashboardTitle,
        }
      : { kind: "empty" };

  const updatedCandidates = [
    lastSent?.state === "verified_displayed" ? lastSent.latest.at : null,
    data.autoRefresh.lastOutcome === "verified_displayed" || data.autoRefresh.lastOutcome === "displayed"
      ? data.autoRefresh.lastAt
      : null,
  ].filter((v): v is string => Boolean(v));
  const updatedAt = updatedCandidates.sort().at(-1) ?? null;

  const warning = assessAutoRefresh(
    toAssessInput(data.autoRefresh, data.deviceMode === "real" ? "real" : "mock"),
  );

  const pickerValue = data.selected?.id ?? "";

  // Which composition the Edit button opens: the one the hero names.
  const editId =
    hero.kind === "last-sent"
      ? hero.id
      : hero.kind === "frame"
        ? data.displayedMatch?.dashboardId ?? null
        : null;

  // Key info: four quiet facts, humanized. Nothing here that needs a manual.
  const batteryPct =
    data.powerSupported !== false && data.power?.battery.percent != null ? data.power.battery.percent : null;
  const wakeLabel = data.nextWake ? humanWake(data.nextWake.at) : null;
  const lastFailed = lastSent ? ["failed", "uncertain"].includes(lastSent.state) : false;
  const lastDisplayed = lastSent?.state === "verified_displayed";
  const sourceIssues = data.sources.filter((src) => src.state === "stale" || src.state === "unavailable").length;

  return (
    <div className="home">
      <div className="home-head">
        <h1>Home</h1>
        <Button variant="quiet" onClick={() => setTemplatesOpen(true)} testId="new-composition">
          + New composition
        </Button>
      </div>

      {overview.error && <ErrorNote>{overview.error}</ErrorNote>}
      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      {overview.stale && (
        <div className="home-notice" data-testid="stale-banner">
          <span>Connection lost — this page may be out of date.</span>
          <Button className="btn-sm" onClick={() => void overview.reload()} disabled={busy} testId="stale-retry">
            Retry
          </Button>
        </div>
      )}

      {firstRun && (
        <div className="home-notice home-welcome" data-testid="onboarding">
          <span>
            <strong>Welcome.</strong> Pick a composition below and press <em>Show on panel</em>.
            {data.simulated ? " Nothing here touches real hardware yet." : ""}{" "}
            <Link href="/device">Set up your device</Link>
          </span>
          <Button className="btn-sm" onClick={() => void dismissFirstRun()} testId="dismiss-onboarding">
            Got it
          </Button>
        </div>
      )}

      {queued && (
        <div className="home-notice" data-testid="queued-banner">
          <span data-testid="queued-detail">
            “{queued.first.dashboardTitle}” will appear when the panel wakes
            {reading.nextWakeLabel ? ` (around ${reading.nextWakeLabel})` : ""}.
          </span>
          <span className="home-notice-actions">
            <Button className="btn-sm" onClick={() => void resolveBlocking("deliver")} disabled={busy} testId="deliver-queued">
              Try now
            </Button>
            <Button className="btn-sm" variant="quiet" onClick={() => void resolveBlocking("cancel")} disabled={busy} testId="cancel-queued">
              Cancel
            </Button>
          </span>
        </div>
      )}

      {unresolved && (
        <div className="home-notice home-notice-alert" data-testid="blocking-banner">
          <span data-testid="uncertain-note">
            Not sure “{unresolved.first.dashboardTitle}” reached the panel. Sending is paused until this is resolved.
          </span>
          <span className="home-notice-actions">
            <Button className="btn-sm" variant="dark" onClick={() => void resolveBlocking("recheck")} disabled={busy} testId="recheck">
              Check the panel
            </Button>
            <Button className="btn-sm" variant="quiet" onClick={() => void resolveBlocking("acknowledge")} disabled={busy} testId="acknowledge">
              Ignore
            </Button>
          </span>
        </div>
      )}

      <section className="home-hero-card" data-testid="on-panel" data-hero={hero.kind}>
        <div className="home-hero-frame">
          {hero.kind === "frame" ? (
            <ScaledPanel inset={0} max={1.15}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/device/frame?t=${frameStamp}`}
                alt="What the panel is showing"
                width={400}
                height={300}
                style={{ width: 400, height: 300, display: "block", imageRendering: "pixelated" }}
                data-testid="panel-frame"
              />
            </ScaledPanel>
          ) : hero.kind === "last-sent" ? (
            <div className="home-hero-last">
              <ScaledPanel inset={0} max={1.15}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/dashboards/${hero.id}/preview?version=${hero.version}&lang=${panelLang}&t=${frameStamp}`}
                  alt={`Last sent: ${hero.title}`}
                  width={400}
                  height={300}
                  style={{ width: 400, height: 300, display: "block", imageRendering: "pixelated" }}
                  data-testid="last-sent-frame"
                />
              </ScaledPanel>
            </div>
          ) : (
            <div className="home-hero-empty" data-testid="panel-empty">
              <p className="home-hero-empty-title">Your panel is waiting for its first picture</p>
              <p className="home-hero-empty-sub">Choose a composition below, or start a new one.</p>
              <Button variant="primary" onClick={() => setTemplatesOpen(true)} testId="empty-new-composition">
                Create a composition
              </Button>
            </div>
          )}
        </div>

        <div className="home-hero-meta">
          {hero.kind === "last-sent" && (
            <span className="home-hero-tag" data-testid="panel-label">Last sent</span>
          )}
          <span className="home-hero-title" data-testid="panel-caption">
            {hero.kind === "frame"
              ? hero.title ?? <span data-testid="unknown-frame">Not sent from here</span>
              : hero.kind === "last-sent"
                ? hero.title
                : "Nothing shown yet"}
          </span>
          {editId && (
            <Link
              href={`/dashboards/${editId}/edit`}
              className="btn btn-sm btn-quiet home-hero-edit"
              data-testid="edit-current"
            >
              <PencilIcon /> Edit
            </Link>
          )}
          {updatedAt && !lastSent && (
            <span className="home-hero-updated" data-testid="panel-updated">
              Updated {relativeTime(updatedAt)}
            </span>
          )}
          {!data.device.observed && (
            <span className="home-hero-updated" data-testid="panel-not-read">Checking…</span>
          )}
          <span className="home-hero-spacer" />
          <AutoRefreshChip auto={data.autoRefresh} onChanged={() => void overview.reload()} />
        </div>

        <div className="home-keyinfo" data-testid="key-info">
          {batteryPct !== null && (
            <span className={`home-key${batteryPct < 20 ? " home-key-alert" : ""}`} data-testid="key-battery">
              <KeyIcon name="battery" /> Battery {batteryPct}%
            </span>
          )}
          {wakeLabel && (
            <span className="home-key" data-testid="key-wake">
              <KeyIcon name="wake" /> Next wake {wakeLabel}
            </span>
          )}
          {lastSent && (
            lastFailed ? (
              <Link href="/diagnostics" className="home-key home-key-alert" data-testid="key-last-update">
                <KeyIcon name="update" /> Last update {relativeTime(lastSent.latest.at)} · Failed — details
              </Link>
            ) : (
              <span className="home-key" data-testid="key-last-update">
                <KeyIcon name="update" /> Last update {relativeTime(lastSent.latest.at)}
                {lastDisplayed ? " ✓ Displayed" : ""}
              </span>
            )
          )}
          {data.sources.length > 0 && (
            <Link
              href="/diagnostics"
              className={`home-key${sourceIssues > 0 ? " home-key-warn" : ""}`}
              data-testid="key-sources"
            >
              <KeyIcon name="sources" />{" "}
              {sourceIssues === 0 ? "Sources OK" : `${sourceIssues} source issue${sourceIssues > 1 ? "s" : ""}`}
            </Link>
          )}
        </div>

        {warning && (
          <AutoRefreshBanner warning={warning} dashboardId={data.autoRefresh.selectedId} onFixed={() => void overview.reload()} />
        )}

        <div className="home-action" data-testid="state-summary" data-state={state.state}>
          <label className="home-action-select">
            <span className="visually-hidden">Composition to show</span>
            <select
              value={pickerValue}
              disabled={busy || compositions.length === 0}
              onChange={(event) => event.target.value && void choose(event.target.value)}
              data-testid="push-picker"
            >
              {!pickerValue && <option value="">Choose a composition…</option>}
              {compositions.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            onClick={() => setSendOpen(true)}
            disabled={busy || data.selected === null}
            testId="push-button"
          >
            Show on panel →
          </Button>
        </div>
        {data.selected === null && compositions.length > 0 && (
          <p className="home-hint" data-testid="no-selection">
            No composition is selected — choose one to show it.
          </p>
        )}
        {data.selected !== null && data.pending?.wouldDedup && (
          <p className="home-hint" data-testid="would-dedup">
            Already on the panel.
          </p>
        )}
      </section>

      <HomeGallery
        device={reading}
        autoRefresh={data.autoRefresh}
        displayedId={data.displayedMatch?.dashboardId ?? null}
        stamp={frameStamp}
        onSettled={() => {
          setFrameStamp(Date.now());
          void overview.reload();
        }}
      />

      <SendFlowDialog
        open={sendOpen}
        dashboardId={data.selected?.id ?? null}
        dashboardTitle={data.selected?.title ?? ""}
        device={reading}
        onClose={() => setSendOpen(false)}
        onSettled={() => {
          setFrameStamp(Date.now());
          void overview.reload();
        }}
      />

      <TemplatePicker
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onCreated={(title) => toast(`Created “${title}”`)}
      />

      <span className="visually-hidden" role="status">
        {reachable
          ? `Device answered ${relativeTime(data.deviceLastSeenAt)}.`
          : "Device did not answer the last read."}
      </span>
    </div>
  );
}
