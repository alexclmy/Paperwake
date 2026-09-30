import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendLedger, blockingPush, findPush, type NewLedgerLine } from "@/server/device/ledger";
import { confirmUncertainFromStatus } from "@/server/device/pushPipeline";
import type { DeviceStatus } from "@/server/device/client";
import { useTempDataRoot } from "./helpers/tempRoot";

/**
 * A manual push that went `uncertain` because the panel slept before it could
 * confirm is settled at the next wake on the device's own word — and only on
 * it. Observed on hardware 2026-09-24: the uncertain push blocked the 23:04
 * autonomous refresh while the panel was already showing that very frame.
 */

let temp: ReturnType<typeof useTempDataRoot>;
beforeEach(() => {
  temp = useTempDataRoot();
});
afterEach(() => {
  temp.dispose();
});

const SHA = "a".repeat(64);

function seedUncertain(origin: "manual" | "auto" = "manual"): string {
  const pushId = "p_uncertain";
  const base = {
    pushId,
    dashboardId: "d_seed",
    dashboardTitle: "Seed",
    version: 9,
    sha256: SHA,
    semanticHash: "b".repeat(64),
    idempotencyKey: "k_seed",
    deviceMode: "real" as const,
    origin,
    forced: false,
    seq: null,
    deduped: null,
    replay: null,
    render: null,
    panelMs: null,
    errorCode: null,
    attempts: 0,
    detail: null,
  } satisfies Omit<NewLedgerLine, "state">;
  appendLedger({ ...base, state: "pending" });
  appendLedger({ ...base, state: "sent" });
  appendLedger({ ...base, state: "uncertain" });
  return pushId;
}

function status(displayed: string | null, stored: string | null = displayed): DeviceStatus {
  return {
    displayed: { sha256: displayed, seq: 153 },
    stored: { sha256: stored, seq: 153, present: stored !== null },
  } as unknown as DeviceStatus;
}

describe("settling an uncertain push at the next wake", () => {
  it("records it verified when the panel is displaying that exact frame, and unblocks", () => {
    const id = seedUncertain();
    expect(confirmUncertainFromStatus(status(SHA))).toBe(true);
    expect(findPush(id)?.state).toBe("verified_displayed");
    expect(blockingPush()).toBeNull();
  });

  it("leaves it for a person when the panel shows a different frame", () => {
    const id = seedUncertain();
    expect(confirmUncertainFromStatus(status("c".repeat(64), SHA))).toBe(false);
    expect(findPush(id)?.state).toBe("uncertain");
  });

  it("does nothing when there is no uncertain push", () => {
    expect(confirmUncertainFromStatus(status(SHA))).toBe(false);
  });
});
