"use client";

import { usePanelLang } from "@/ui/panelLang";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, apiSend } from "./api";
import { Button } from "./components";
import { SendFlowDialog } from "./SendFlowDialog";
import { TEMPLATES, SAMPLE_TEMPLATE_KEYS } from "@/core/templates";
import { createFromTemplate } from "./createFromTemplate";

/** The library boards a fresh install can be seeded with, in one click. */
import type { DeviceReading } from "./useDeviceState";

interface Summary {
  id: string;
  title: string;
  status: "active" | "archived";
  latestVersion: number;
}

/**
 * The home gallery: every active composition as its real render, one click to
 * show it. "Show on panel" selects it and opens the send review straight away; the
 * frame goes out only after the review is confirmed, exactly as before.
 */
export function HomeGallery({
  device,
  displayedId,
  stamp,
  autoRefresh,
  onSettled,
}: {
  autoRefresh?: { selectedId: string | null; intervalMinutes: number | null; disabledReason: string | null };
  device: DeviceReading | null;
  displayedId: string | null;
  stamp: number;
  onSettled: () => void;
}) {
  const { lang: panelLang } = usePanelLang();
  const [list, setList] = useState<Summary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);

  async function addSamples(): Promise<void> {
    setSeeding(true);
    setError("");
    try {
      const now = new Date();
      for (const key of SAMPLE_TEMPLATE_KEYS) {
        const template = TEMPLATES.find((t) => t.key === key);
        if (template) await createFromTemplate(template, now);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The sample boards could not be created");
    } finally {
      setSeeding(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const payload = await apiGet<{ selectedDashboardId: string | null; dashboards: Summary[] }>(
        "/api/dashboards",
      );
      setList(payload.dashboards.filter((d) => d.status === "active"));
      setSelectedId(payload.selectedDashboardId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Compositions could not be loaded");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function show(summary: Summary): Promise<void> {
    setSendFor(summary);
    try {
      await apiSend(`/api/dashboards/${summary.id}`, "PATCH", { selected: true });
      setSelectedId(summary.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Selection failed");
    }
  }

  return (
    <section className="home-gallery" aria-labelledby="home-gallery-title" data-testid="home-gallery">
      <div className="home-gallery-head">
        <h2 id="home-gallery-title">Compositions</h2>
        <Link href="/dashboards" className="btn btn-quiet">
          Manage all
        </Link>
      </div>
      {error && <p className="error-note">{error}</p>}
      {list && list.length === 0 && (
        <div className="home-empty" data-testid="home-empty">
          <p className="field-hint">
            No compositions yet. Create one with “New composition”, or start with five
            ready boards drawn for this panel.
          </p>
          <Button variant="primary" onClick={() => void addSamples()} disabled={seeding} testId="add-sample-boards">
            {seeding ? "Adding…" : "Add sample boards"}
          </Button>
        </div>
      )}
      <div className="home-gallery-grid">
        {list?.map((summary) => {
          const onPanel = displayedId === summary.id;
          return (
            <article
              key={summary.id}
              className="home-card"
              data-on-panel={onPanel || undefined}
              data-testid={`home-card-${summary.id}`}
            >
              <Link href={`/dashboards/${summary.id}/edit`} className="home-thumb" aria-label={`Edit ${summary.title}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/dashboards/${summary.id}/preview?live=1&lang=${panelLang}&t=${stamp}`}
                  alt={`Preview of ${summary.title}`}
                  width={400}
                  height={300}
                  loading="lazy"
                />
                {onPanel && <span className="home-flag">On panel</span>}
                {autoRefresh?.selectedId === summary.id && autoRefresh.disabledReason === null && (
                  <span className="home-auto-badge" data-testid={`auto-badge-${summary.id}`}>
                    Auto · {autoRefresh.intervalMinutes} min
                  </span>
                )}
                {!onPanel && selectedId === summary.id && <span className="home-flag home-flag-quiet">Selected</span>}
              </Link>
              <div className="home-card-foot">
                <span className="home-card-title" title={summary.title}>
                  {summary.title}
                </span>
                {onPanel ? (
                  <span className="home-card-state">On panel ✓</span>
                ) : (
                  <Button variant="primary" onClick={() => void show(summary)} testId={`home-show-${summary.id}`}>
                    Show on panel
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <SendFlowDialog
        open={sendFor !== null}
        dashboardId={sendFor?.id ?? null}
        dashboardTitle={sendFor?.title ?? ""}
        device={device}
        onClose={() => setSendFor(null)}
        onSettled={() => {
          void load();
          onSettled();
        }}
      />
    </section>
  );
}
