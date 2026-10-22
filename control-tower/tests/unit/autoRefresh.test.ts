import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  assessAutoRefresh,
  disabledReason,
  staleAfterMs,
  type AutoRefreshInput,
} from "@/core/autoRefresh";
import { createDashboard, readRecord, selectDashboard } from "@/server/store/dashboards";
import { readState, updateState } from "@/server/store/state";
import { issueSession, CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from "@/server/auth/session";
import { resetDisabledNoteForTests, runRefreshTick } from "@/server/refreshScheduler";
import { PATCH } from "../../app/api/dashboards/[id]/route";
import { useTempDataRoot } from "./helpers/tempRoot";

const NOW = new Date("2026-10-22T12:00:00Z");

function input(overrides: Partial<AutoRefreshInput> = {}): AutoRefreshInput {
  return {
    selectedId: "a",
    selected: { id: "a", title: "Morning", status: "active", intervalMinutes: 60 },
    lastAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
    lastDashboardId: "a",
    lastOutcome: "verified_displayed",
    wakeIntervalMin: 120,
    deviceMode: "real",
    now: NOW,
    ...overrides,
  };
}

describe("assessAutoRefresh", () => {
  it("is quiet when everything is fine", () => {
    expect(assessAutoRefresh(input())).toBeNull();
  });

  it("flags a composition with no interval and offers the 60-minute fix", () => {
    const warning = assessAutoRefresh(
      input({ selected: { id: "a", title: "Morning", status: "active", intervalMinutes: null } }),
    );
    expect(warning?.code).toBe("no_interval");
    expect(warning?.fix).toEqual({ label: "Refresh every 60 min", intervalMinutes: 60 });
  });

  it("flags archived, missing and absent selections without a fix", () => {
    expect(
      assessAutoRefresh(input({ selected: { id: "a", title: "M", status: "archived", intervalMinutes: 60 } }))?.code,
    ).toBe("archived");
    expect(assessAutoRefresh(input({ selected: null }))?.code).toBe("missing");
    expect(assessAutoRefresh(input({ selectedId: null, selected: null }))?.code).toBe("no_selection");
    expect(assessAutoRefresh(input({ selected: null }))?.fix).toBeNull();
  });

  it("flags failed and blocked outcomes of this composition only", () => {
    expect(assessAutoRefresh(input({ lastOutcome: "failed" }))?.code).toBe("last_failed");
    expect(assessAutoRefresh(input({ lastOutcome: "blocked" }))?.code).toBe("last_blocked");
    expect(assessAutoRefresh(input({ lastOutcome: "failed", lastDashboardId: "other" }))).toBeNull();
  });

  it("flags staleness beyond 2x interval + one wake cycle", () => {
    const limit = staleAfterMs(60, 120);
    expect(limit).toBe(240 * 60_000);
    const justInside = new Date(NOW.getTime() - limit + 60_000).toISOString();
    const justOutside = new Date(NOW.getTime() - limit - 60_000).toISOString();
    expect(assessAutoRefresh(input({ lastAt: justInside }))).toBeNull();
    expect(assessAutoRefresh(input({ lastAt: justOutside }))?.code).toBe("stale");
  });

  it("does not raise run-time warnings for the simulated device", () => {
    expect(assessAutoRefresh(input({ deviceMode: "mock", lastOutcome: "failed" }))).toBeNull();
    // ...but a missing interval is a configuration fact and still shows.
    expect(
      assessAutoRefresh(
        input({ deviceMode: "mock", selected: { id: "a", title: "M", status: "active", intervalMinutes: null } }),
      )?.code,
    ).toBe("no_interval");
  });

  it("disabledReason matches the scheduler's own rule", () => {
    expect(disabledReason({ selectedId: "a", selected: input().selected })).toBeNull();
  });
});

describe("PATCH /api/dashboards/[id] refreshIntervalMinutes", () => {
  let temp: ReturnType<typeof useTempDataRoot>;
  beforeEach(() => {
    temp = useTempDataRoot();
  });
  afterEach(() => temp.dispose());

  function request(id: string, body: unknown, csrf = true): NextRequest {
    const session = issueSession();
    const headers = new Headers({
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE}=${session.token}; ${CSRF_COOKIE}=${session.csrf}`,
    });
    if (csrf) headers.set(CSRF_HEADER, session.csrf);
    return new NextRequest(`http://localhost/api/dashboards/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
  }

  it("sets the interval and selects in one call", async () => {
    const id = createDashboard("Scheduled").doc.id;
    const response = await PATCH(request(id, { refreshIntervalMinutes: 60, selected: true }));
    expect(response.status).toBe(200);
    expect(readRecord(id)?.doc.refreshIntervalMinutes).toBe(60);
    expect(readState().selectedDashboardId).toBe(id);
  });

  it("rejects an interval outside the allowed set", async () => {
    const id = createDashboard("Scheduled").doc.id;
    const response = await PATCH(request(id, { refreshIntervalMinutes: 45 }));
    expect(response.status).toBe(400);
    expect(readRecord(id)?.doc.refreshIntervalMinutes).toBeNull();
  });

  it("refuses without the CSRF header", async () => {
    const id = createDashboard("Scheduled").doc.id;
    const response = await PATCH(request(id, { refreshIntervalMinutes: 60 }, false));
    expect(response.status).toBe(403);
    expect(readRecord(id)?.doc.refreshIntervalMinutes).toBeNull();
  });
});

describe("scheduler disabled log", () => {
  let temp: ReturnType<typeof useTempDataRoot>;
  beforeEach(() => {
    temp = useTempDataRoot();
    resetDisabledNoteForTests();
  });
  afterEach(() => {
    temp.dispose();
    vi.restoreAllMocks();
  });

  it("logs the reason once per change, not every tick", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = createDashboard("No interval").doc.id;
    selectDashboard(id);
    updateState({ deviceMode: "real" });
    expect(await runRefreshTick()).toBe("disabled");
    expect(await runRefreshTick()).toBe("disabled");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("no_interval");
  });
});
