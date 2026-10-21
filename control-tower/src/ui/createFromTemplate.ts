import type { DashboardDoc } from "@/core/model";
import type { Template } from "@/core/templates";
import { apiSend } from "./api";

/**
 * Create a composition from a template, the way the template picker always
 * has: an empty v1 the history keeps, then the template's layout saved as v2.
 * Shared by the picker and the first-run "add sample boards" button.
 */
export async function createFromTemplate(
  template: Template,
  now: Date = new Date(),
): Promise<string> {
  const doc = template.build(now);
  const created = await apiSend<{ record: { doc: { id: string } } }>(
    "/api/dashboards",
    "POST",
    { title: template.name, starter: false },
  );
  const id = created.record.doc.id;
  if (doc.modules.length > 0) {
    const current = await apiSend<{ record: { doc: DashboardDoc } }>(
      `/api/dashboards/${id}`,
      "PUT",
      { doc: { ...doc, id, title: template.name } },
    );
    await apiSend(`/api/dashboards/${id}/versions`, "POST", {
      doc: current.record.doc,
      note: `Started from the ${template.name} template`,
    });
  }
  return id;
}
