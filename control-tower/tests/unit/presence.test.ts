import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateState } from "@/server/store/state";
import { useTempDataRoot } from "./helpers/tempRoot";

/**
 * The idle presence watch: with nothing waiting, the scheduler still looks at
 * a gentle pace, so pressing BOOT turns the header to Awake without anyone
 * clicking "Check now". The device context is faked — the property under test
 * is the cadence and what gets remembered, not the transport.
 */

const status = vi.fn();
vi.mock("@/server/device/context", () => ({
  deviceContext: vi.fn(async () => ({
    client: { status },
    state: {},
    simulated: false,
    tokenConfigured: true,
  })),
}));

const { runFastCatchTick, resetPresenceWatchForTests, PRESENCE_INTERVAL_MS } = await import(
  "@/server/refreshScheduler"
);
const { readPresence, resetPresenceForTests } = await import("@/server/device/presence");

let temp: ReturnType<typeof useTempDataRoot>;

beforeEach(() => {
  temp = useTempDataRoot();
  updateState({ deviceMode: "real" });
  resetPresenceWatchForTests();
  resetPresenceForTests();
  status.mockReset();
});

afterEach(() => {
  temp.dispose();
});

const ANSWER = {
  displayed: { sha256: null },
  stored: { sha256: null, present: false },
  capabilities: [],
  power: { mode: "auto_saver", awake: true },
};

describe("presence watch", () => {
  it("looks when idle and remembers that the device answered", async () => {
    status.mockResolvedValue(ANSWER);
    await runFastCatchTick(1_000_000);
    expect(status).toHaveBeenCalledOnce();
    expect(readPresence()).toMatchObject({ reachable: true });
  });

  it("keeps its own slower pace when nothing is waiting", async () => {
    status.mockResolvedValue(ANSWER);
    await runFastCatchTick(1_000_000);
    await runFastCatchTick(1_000_000 + PRESENCE_INTERVAL_MS - 1);
    expect(status).toHaveBeenCalledOnce();
    await runFastCatchTick(1_000_000 + PRESENCE_INTERVAL_MS);
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("records silence as silence, never as an answer", async () => {
    status.mockRejectedValue(new Error("connect EHOSTDOWN"));
    await runFastCatchTick(1_000_000);
    expect(readPresence()).toMatchObject({ reachable: false, status: null });
  });

  it("never looks at the mock, which is always reachable", async () => {
    updateState({ deviceMode: "mock" });
    await runFastCatchTick(1_000_000);
    expect(status).not.toHaveBeenCalled();
  });
});
