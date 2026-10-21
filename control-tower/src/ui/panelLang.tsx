"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { DEFAULT_PANEL_LANG, type PanelLang } from "@/core/render/i18n";
import { apiSend } from "./api";

/**
 * The tower-wide panel language, shared by every preview on the page.
 *
 * Seeded from the server (state.json) by the app layout, so the first paint
 * already matches what a push would send. Changing it is the same PATCH
 * /api/state every other preference uses (session, CSRF and lockdown apply),
 * and is applied locally first so the previews re-render immediately.
 */
interface PanelLangValue {
  lang: PanelLang;
  setLang: (next: PanelLang) => Promise<void>;
}

const PanelLangContext = createContext<PanelLangValue>({
  lang: DEFAULT_PANEL_LANG,
  setLang: async () => {},
});

export function PanelLangProvider({ initial, children }: { initial: PanelLang; children: ReactNode }) {
  const [lang, setLocal] = useState<PanelLang>(initial);
  const setLang = useCallback(
    async (next: PanelLang) => {
      const previous = lang;
      setLocal(next);
      try {
        await apiSend("/api/state", "PATCH", { panelLang: next });
      } catch (error) {
        setLocal(previous);
        throw error;
      }
    },
    [lang],
  );
  return <PanelLangContext.Provider value={{ lang, setLang }}>{children}</PanelLangContext.Provider>;
}

export function usePanelLang(): PanelLangValue {
  return useContext(PanelLangContext);
}

/** Render-context fragment: nothing for French, so contexts stay historical. */
export function langCtx(lang: PanelLang): { lang?: PanelLang } {
  return lang === "fr" ? {} : { lang };
}

export const PANEL_LANG_LABELS: Record<PanelLang, string> = { fr: "Français", en: "English" };

/** Segmented control: Français / English. */
export function PanelLangSwitch({ compact = false, testId = "panel-lang" }: { compact?: boolean; testId?: string }) {
  const { lang, setLang } = usePanelLang();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="panel-lang-switch" data-compact={compact ? "true" : undefined}>
      <div className="segmented" role="group" aria-label="Panel language" data-testid={testId}>
        {(["fr", "en"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={lang === option}
            data-testid={`${testId}-${option}`}
            onClick={() => {
              setError(null);
              setLang(option).catch((caught: unknown) =>
                setError(caught instanceof Error ? caught.message : "Could not save the panel language"),
              );
            }}
          >
            {compact ? option.toUpperCase() : PANEL_LANG_LABELS[option]}
          </button>
        ))}
      </div>
      {error && (
        <p className="mono-note" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
