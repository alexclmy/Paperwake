"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardDoc } from "@/core/model";
import { emptySources } from "@/core/render/data";
import { TEMPLATES } from "@/core/templates";
import { ApiError, apiSend } from "./api";
import { Button } from "./components";
import { Dialog } from "./Dialog";
import { FramePreview } from "./FramePreview";

export function TemplatePicker({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (name: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // One clock for all five, fixed for the life of this dialog: the timestamp
  // module draws the render time, and a `new Date()` per render would repaint
  // five canvases every second.
  const now = useMemo(() => new Date(), []);
  const sources = useMemo(() => emptySources(), []);
  const docs = useMemo(
    () => TEMPLATES.map((template) => template.build(now)),
    [now],
  );

  async function choose(index: number): Promise<void> {
    const template = TEMPLATES[index];
    const doc = docs[index];
    if (!template || !doc) return;
    setBusy(true);
    setError("");
    try {
      /*
       * The composition is created empty — a blank v1 the product keeps in the
       * history rather than tidying away — and then the template's layout is
       * written as the working document and saved as v2. "v1 was the blank
       * canvas this started from" is true and worth being able to roll back to,
       * and this product never rewrites a version list.
       */
      const created = await apiSend<{ record: { doc: { id: string } } }>(
        "/api/dashboards",
        "POST",
        { title: template.name, starter: false },
      );
      const id = created.record.doc.id;

      if (doc.modules.length > 0) {
        // The server minted the id and the timestamps; only the layout is
        // ours to contribute, so the document that goes back is the server's
        // with our modules in it rather than the one built above wholesale.
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

      onCreated?.(template.name);
      onClose();
      router.push(`/dashboards/${id}/edit`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The composition could not be created",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog
      open={open}
      title="New composition"
      subtitle="Start from something that already reads well on the panel. Everything stays editable."
      wide
      id="template-picker"
      testId="template-picker"
      onClose={onClose}
      head={
        <Button
          className="modal-close"
          onClick={onClose}
          ariaLabel="Close"
          testId="template-close"
        >
          ✕
        </Button>
      }
      footer={null}
    >
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      <div className="template-grid">
        {TEMPLATES.map((template, index) => (
          <button
            type="button"
            className="template-card"
            key={template.key}
            onClick={() => void choose(index)}
            disabled={busy}
            data-testid={`template-${template.key}`}
            {...(index === 0 ? { "data-dialog-autofocus": "" } : {})}
          >
            <span className="template-thumb">
              <FramePreview
                doc={docs[index] as DashboardDoc}
                sources={sources}
                now={now}
                fluid
              />
            </span>
            <span className="template-text">
              <strong>{template.name}</strong>
              <span>{template.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
