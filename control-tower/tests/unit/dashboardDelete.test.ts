import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DashboardDeleteRefusedError,
  createDashboard,
  deleteDashboard,
  listDashboardIds,
  readRecord,
  saveVersion,
  selectDashboard,
} from "@/server/store/dashboards";
import { appendLedger, hasBlockingPushFor } from "@/server/device/ledger";
import { paths } from "@/server/store/paths";
import { updateState } from "@/server/store/state";
import { useTempDataRoot } from "./helpers/tempRoot";

let temp: ReturnType<typeof useTempDataRoot>;
beforeEach(() => {
  temp = useTempDataRoot();
});
afterEach(() => temp.dispose());

function push(dashboardId: string, state: "pending" | "queued" | "verified_displayed", pushId = "p1") {
  appendLedger({
    pushId, state, dashboardId, dashboardTitle: "t", version: 1, sha256: "a".repeat(64),
    semanticHash: "b", idempotencyKey: "k", deviceMode: "mock", origin: "manual", forced: false,
    seq: null, deduped: null, replay: null, render: null, panelMs: null, errorCode: null,
    attempts: 0, detail: null,
  });
}

describe("hard delete", () => {
  it("removes the record and every version", () => {
    const record = createDashboard("À supprimer");
    saveVersion(record.doc.id, record.doc, "v2");
    const result = deleteDashboard(record.doc.id, hasBlockingPushFor);
    expect(result.versions).toBeGreaterThanOrEqual(1);
    expect(readRecord(record.doc.id)).toBeNull();
    expect(fs.existsSync(paths.dashboardDir(record.doc.id))).toBe(false);
    expect(listDashboardIds()).not.toContain(record.doc.id);
    expect(fs.readdirSync(paths.dashboards()).some((n) => n.startsWith(".deleted-"))).toBe(false);
  });

  it("refuses the selected composition and changes nothing", () => {
    const record = createDashboard("Sélectionnée");
    selectDashboard(record.doc.id);
    expect(() => deleteDashboard(record.doc.id, hasBlockingPushFor)).toThrow(DashboardDeleteRefusedError);
    expect(readRecord(record.doc.id)).not.toBeNull();
    updateState({ selectedDashboardId: null });
    expect(() => deleteDashboard(record.doc.id, hasBlockingPushFor)).not.toThrow();
  });

  it("refuses while a push is outstanding, allows once it is terminal", () => {
    const record = createDashboard("En vol");
    push(record.doc.id, "queued");
    expect(hasBlockingPushFor(record.doc.id)).toBe(true);
    try {
      deleteDashboard(record.doc.id, hasBlockingPushFor);
      throw new Error("should refuse");
    } catch (error) {
      expect((error as DashboardDeleteRefusedError).reason).toBe("push_in_flight");
    }
    push(record.doc.id, "verified_displayed");
    expect(hasBlockingPushFor(record.doc.id)).toBe(false);
    deleteDashboard(record.doc.id, hasBlockingPushFor);
    expect(readRecord(record.doc.id)).toBeNull();
  });

  it("an unknown or unsafe id is not found, never a path", () => {
    expect(() => deleteDashboard("../state", hasBlockingPushFor)).toThrow(/No dashboard/);
    expect(() => deleteDashboard("d_missing", hasBlockingPushFor)).toThrow(/No dashboard/);
  });

  it("the DELETE route is guarded as a mutation and confirms the id", () => {
    const src = fs.readFileSync("app/api/dashboards/[id]/route.ts", "utf8");
    expect(src).toMatch(/export const DELETE = guarded\(\s*\{ mutating: true/);
    expect(src).toContain("confirm_mismatch");
    expect(src).toContain("409");
  });
});
