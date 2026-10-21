import { NextResponse } from "next/server";
import { z } from "zod";
import { DashboardDocSchema } from "@/core/model";
import { appendAudit } from "@/server/audit";
import { guarded, jsonError } from "@/server/auth/guard";
import { hasBlockingPushFor } from "@/server/device/ledger";
import {
  DashboardDeleteRefusedError,
  DashboardNotFoundError,
  archiveDashboard,
  deleteDashboard,
  listVersions,
  readRecord,
  restoreDashboard,
  selectDashboard,
  updateDashboard,
} from "@/server/store/dashboards";

export const dynamic = "force-dynamic";

function idFrom(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export const GET = guarded({}, async ({ request }) => {
  const id = idFrom(request.nextUrl.pathname);
  const record = readRecord(id);
  if (!record) return jsonError(404, "not_found", `No dashboard with id "${id}"`);
  return NextResponse.json({ record, versions: listVersions(id) });
});

const UpdateSchema = z.object({ doc: DashboardDocSchema });

export const PUT = guarded(
  { mutating: true, schema: UpdateSchema, action: "dashboard.update" },
  async ({ request, body }) => {
    const id = idFrom(request.nextUrl.pathname);
    const record = updateDashboard(id, body.doc);
    appendAudit({
      action: "dashboard.update",
      target: id,
      params: { moduleCount: body.doc.modules.length },
      outcome: "ok",
      detail: "Working document replaced; no version was created",
    });
    return NextResponse.json({ record });
  },
);

const PatchSchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  selected: z.literal(true).optional(),
});

export const PATCH = guarded(
  { mutating: true, schema: PatchSchema, action: "dashboard.patch" },
  async ({ request, body }) => {
    const id = idFrom(request.nextUrl.pathname);

    if (body.status) {
      const record =
        body.status === "archived" ? archiveDashboard(id) : restoreDashboard(id);
      appendAudit({
        action: `dashboard.${body.status === "archived" ? "archive" : "restore"}`,
        target: id,
        outcome: "ok",
        detail: `Status is now ${record.doc.status}`,
      });
    }

    if (body.selected) {
      selectDashboard(id);
      appendAudit({
        action: "dashboard.select",
        target: id,
        outcome: "ok",
        detail: "Selected for the next push",
      });
    }

    const record = readRecord(id);
    if (!record) return jsonError(404, "not_found", `No dashboard with id "${id}"`);
    return NextResponse.json({ record });
  },
);

/**
 * Hard delete. Same guard as every mutation (session + CSRF + audit). The
 * body must confirm the id, so a stray DELETE cannot remove anything.
 * 409 when the composition is selected or has a push outstanding: the caller
 * is told why, nothing is changed. See deleteDashboard() for the semantics.
 */
const DeleteSchema = z.object({ confirm: z.string() });

export const DELETE = guarded(
  { mutating: true, schema: DeleteSchema, action: "dashboard.delete" },
  async ({ request, body }) => {
    const id = idFrom(request.nextUrl.pathname);
    if (body.confirm !== id) {
      return jsonError(400, "confirm_mismatch", "The confirmation does not name this composition");
    }
    try {
      const result = deleteDashboard(id, hasBlockingPushFor);
      appendAudit({
        action: "dashboard.delete",
        target: id,
        params: { versions: result.versions },
        outcome: "ok",
        detail: "Record and every version removed",
      });
      return NextResponse.json({ deleted: result });
    } catch (error) {
      if (error instanceof DashboardDeleteRefusedError) {
        appendAudit({ action: "dashboard.delete", target: id, outcome: "refused", detail: error.reason });
        return jsonError(409, error.reason, error.message);
      }
      if (error instanceof DashboardNotFoundError) {
        return jsonError(404, "not_found", `No dashboard with id "${id}"`);
      }
      throw error;
    }
  },
);
