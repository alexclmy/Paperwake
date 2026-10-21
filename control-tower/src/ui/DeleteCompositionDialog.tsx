"use client";

import { useEffect, useState } from "react";
import { ApiError, apiSend } from "./api";
import { Button } from "./components";
import { Dialog } from "./Dialog";

/**
 * "Delete permanently" / "Archive instead" / "Cancel".
 *
 * Archive is offered first-class because it is what most people mean: it
 * hides the composition and keeps every version. Deleting removes the record
 * and all versions for good; the server refuses (409) when it is the selected
 * composition or a push of it is still outstanding, and the reason is shown
 * here verbatim — nothing is changed in that case.
 */
export function DeleteCompositionDialog({
  target,
  selected,
  onClose,
  onArchive,
  onDeleted,
}: {
  target: { id: string; title: string; status: "active" | "archived" } | null;
  selected: boolean;
  onClose: () => void;
  onArchive: (target: { id: string; title: string }) => void;
  onDeleted: (target: { id: string; title: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    setBusy(false);
  }, [target?.id]);

  if (!target) return null;

  async function remove(): Promise<void> {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await apiSend(`/api/dashboards/${target.id}`, "DELETE", { confirm: target.id });
      onDeleted(target);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      id="delete-composition"
      testId="delete-confirm"
      title={`Delete “${target.title}”?`}
      subtitle="The composition and all its versions will be erased. This cannot be undone."
      onClose={onClose}
      footer={null}
    >
      {selected && (
        <p className="banner banner-attention" data-testid="delete-selected-note">
          This is the composition selected for the panel. Select another one
          before deleting it, or archive it instead.
        </p>
      )}
      {error && (
        <p className="error-note" role="alert" data-testid="delete-error">
          {error}
        </p>
      )}
      <div className="confirm-actions">
        <Button
          variant="danger"
          disabled={busy || selected}
          onClick={() => void remove()}
          testId="delete-confirm-button"
        >
          Delete permanently
        </Button>
        {target.status === "active" && (
          <Button disabled={busy} onClick={() => onArchive(target)} testId="delete-archive-instead">
            Archive instead
          </Button>
        )}
        <Button variant="quiet" disabled={busy} onClick={onClose} testId="delete-cancel">
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
