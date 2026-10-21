"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_HOME_SENSORS, type HomeSensorEntity } from "@/core/render/modules/homeSensors";
import { apiGet, isAbort } from "./api";

interface Choice {
  entityId: string;
  name: string;
  deviceClass: string | null;
  unit: string | null;
  value: string;
  numeric: boolean;
}

interface EntitiesResponse {
  configured: boolean;
  state: "ok" | "unavailable" | "not_configured";
  detail?: string;
  entities: Choice[];
}

const CLASS_LABEL: Record<string, string> = { temperature: "Temperature", humidity: "Humidity" };

/**
 * Pick Home Assistant sensors for the Home sensors module.
 *
 * The list comes from the tower (/api/home-assistant/entities), which reads
 * Home Assistant read-only and never sends its URL or token here. Temperature
 * and humidity come first; any numeric sensor can be added. Each pick can be
 * given a short panel label.
 */
export function HomeSensorsField({
  value,
  onChange,
}: {
  value: HomeSensorEntity[];
  onChange: (next: HomeSensorEntity[]) => void;
}) {
  const [data, setData] = useState<EntitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiGet<EntitiesResponse>("/api/home-assistant/entities", { signal: controller.signal })
      .then(setData)
      .catch((caught: unknown) => {
        if (!isAbort(caught)) setError("Could not load the sensor list");
      });
    return () => controller.abort();
  }, []);

  const picked = new Set(value.map((entity) => entity.entityId));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.entities ?? []).filter((choice) => {
      if (!showAll && !choice.numeric) return false;
      if (q.length === 0) return true;
      return (
        choice.name.toLowerCase().includes(q) ||
        choice.entityId.toLowerCase().includes(q) ||
        (choice.deviceClass ?? "").includes(q)
      );
    });
  }, [data, query, showAll]);

  const counts = useMemo(() => {
    const all = data?.entities ?? [];
    return {
      temperature: all.filter((c) => c.deviceClass === "temperature").length,
      humidity: all.filter((c) => c.deviceClass === "humidity").length,
    };
  }, [data]);

  const full = value.length >= MAX_HOME_SENSORS;

  const add = (choice: Choice): void => {
    if (picked.has(choice.entityId) || full) return;
    onChange([...value, { entityId: choice.entityId, label: "", name: choice.name.slice(0, 60) }]);
  };
  const remove = (index: number): void => onChange(value.filter((_, i) => i !== index));
  const move = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    onChange(next);
  };

  return (
    <div className="text-role" data-testid="opt-entities-role">
      <div className="text-role-head">
        <label>Sensors</label>
        <span className="field-hint">
          {value.length} of {MAX_HOME_SENSORS}
        </span>
      </div>

      {value.length === 0 && (
        <p className="field-hint" data-testid="ha-picked-empty">
          No sensor yet. Pick one from the list below.
        </p>
      )}

      <ul className="row-editor" data-testid="ha-picked">
        {value.map((entity, index) => (
          <li key={entity.entityId} data-testid={`ha-picked-${index}`}>
            <input
              type="text"
              value={entity.label}
              maxLength={24}
              placeholder={entity.name || entity.entityId}
              aria-label={`Panel label for ${entity.name || entity.entityId}`}
              onChange={(event) => {
                const next = [...value];
                next[index] = { ...entity, label: event.target.value };
                onChange(next);
              }}
              data-testid={`ha-picked-${index}-label`}
            />
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
              ↑
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => move(index, 1)}
              disabled={index === value.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => remove(index)} aria-label="Remove sensor">
              ✕
            </button>
            <span className="field-hint ha-entity-id">{entity.entityId}</span>
          </li>
        ))}
      </ul>

      <div className="ha-picker" data-testid="ha-picker">
        {error && <p className="error-note">{error}</p>}
        {!data && !error && <p className="field-hint">Loading sensors from Home Assistant…</p>}
        {data && data.state === "not_configured" && (
          <p className="field-hint" data-testid="ha-not-configured">
            Home Assistant is not configured on this tower. Set NOTE4C_HA_URL and NOTE4C_HA_TOKEN.
          </p>
        )}
        {data && data.state === "unavailable" && (
          <p className="error-note" data-testid="ha-unavailable">
            Home Assistant did not answer ({data.detail ?? "unavailable"}).
          </p>
        )}
        {data && data.state === "ok" && (
          <>
            <p className="field-hint" data-testid="ha-counts">
              {data.entities.length} sensors · {counts.temperature} temperature · {counts.humidity} humidity
            </p>
            <input
              type="search"
              placeholder="Search sensors"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search sensors"
              data-testid="ha-search"
            />
            <label className="field field-switch">
              <span>
                Include non-numeric sensors
                <input type="checkbox" role="switch" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              </span>
            </label>
            <ul className="ha-choice-list" data-testid="ha-choices">
              {filtered.slice(0, 60).map((choice) => (
                <li key={choice.entityId}>
                  <button
                    type="button"
                    className="ha-choice"
                    onClick={() => add(choice)}
                    disabled={picked.has(choice.entityId) || full}
                    data-testid={`ha-choice-${choice.entityId}`}
                  >
                    <span className="ha-choice-name">{choice.name}</span>
                    <span className="ha-choice-meta">
                      {choice.deviceClass ? (CLASS_LABEL[choice.deviceClass] ?? choice.deviceClass) : "Sensor"} · {choice.value}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="field-hint">No sensor matches.</li>}
              {filtered.length > 60 && <li className="field-hint">{filtered.length - 60} more — refine the search.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
