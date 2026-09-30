"use client";

import {
  INTERACTIVE_MINUTES,
  INTERACTIVE_REQUEST_NOTE,
  deriveDeviceState,
  describeWhatHappensNext,
  type DeviceStateInput,
} from "@/core/power";
import { useState } from "react";
import { Button, Card } from "./components";
import { Disclosure } from "./Disclosure";
import { useRegisterPageDeviceState } from "./pageDeviceState";

/**
 * "Now": what the device is doing, and the two things you can do about it.
 *
 * This was a one-line strip across the top of Overview and Device. It is a
 * card now, and the reason is not decoration: the strip carried a badge, a
 * reason, an address, a wake time and two buttons on one line, which on a
 * phone wrapped into five ragged rows and on a desktop read as a toolbar
 * rather than as the most important fact on the page.
 *
 * The word and the sentence both come from `deriveDeviceState` and from
 * nowhere else — the same call the header chip makes — so the two renderings
 * of the device's state cannot disagree. That was the original defect this
 * component was written for: Overview showed a red UNREACHABLE for a device
 * sleeping exactly as designed while Device showed a yellow "Not answering",
 * and a reader moving between them had to work out that both meant the same
 * thing.
 *
 * It carries the one request that most often precedes touching the device:
 * asking it to stay awake. That is the thing you want before you walk over to
 * the panel, and it used to be six buttons deep inside one card of one page.
 */
export function StateStrip({
  input,
  address,
  nextWakeLabel,
  batteryLine,
  onReadAgain,
  checking = false,
  onInteractive,
  busy,
  testId = "state-strip",
}: {
  input: DeviceStateInput;
  address: string | null;
  nextWakeLabel: string | null;
  /** Already worded by the caller, which is the page that read the battery. */
  batteryLine?: string | null;
  onReadAgain?: () => void;
  /**
   * A read somebody pressed for is in flight.
   *
   * Separate from `busy`, which covers writes. It is here because this read is
   * now allowed to take real time: when this machine is refusing connections
   * to the panel out of its own routing table — a state it holds for about
   * twenty seconds after one failed address resolution — the only way to get a
   * true answer is to wait it out. A button that looks inert for twenty
   * seconds gets pressed four more times; one that says what it is doing does
   * not.
   */
  checking?: boolean;
  /** Given the window in minutes, so the choice below means something. */
  onInteractive?: (minutes: number) => void;
  busy?: boolean;
  testId?: string;
}) {
  const reading = deriveDeviceState(input);
  /*
   * Which window the next request asks for. It is a choice about *now* —
   * somebody is about to walk over to the device — so it is not persisted
   * anywhere. Fifteen minutes is the default because it is about the length of
   * one trip to the panel and back.
   */
  const [minutes, setMinutes] = useState<number>(15);

  // Tell the shell this page is already showing the state, so nothing in the
  // chrome stacks a second copy of it. See src/ui/pageDeviceState.ts.
  useRegisterPageDeviceState();

  const awake = reading.state === "awake";

  return (
    <div className="state-strip" data-testid={testId} data-device-state={reading.state} data-state={reading.state}>
    <Card title="Now" variant="plain">
      <div className="now-grid">
        <div className="now-main">
          <div className="now-line" data-device-state={reading.state}>
            <span className="chip-dot now-dot" aria-hidden="true" />
            <strong data-testid={`${testId}-badge`}>{reading.label}</strong>
          </div>
          <p className="now-reason">
            {reading.reason} {describeWhatHappensNext(reading.state, nextWakeLabel)}
          </p>
          {/*
            The facts, in one mono row. The address is the tower's configured
            one, not anything the device announced.
          */}
          <div className="now-facts">
            {batteryLine && <span>{batteryLine}</span>}
            {nextWakeLabel && <span>next wake ~{nextWakeLabel}</span>}
            {address && <span className="num">{address}</span>}
          </div>
        </div>

        <div className="now-side">
          {onReadAgain && (
            <Button onClick={onReadAgain} disabled={busy || checking} testId="refresh">
              {checking ? "Checking…" : "Check now"}
            </Button>
          )}
          {onInteractive && (
            <div className="now-interactive">
              <div className="card-actions">
                <Button
                  onClick={() => onInteractive(minutes)}
                  disabled={busy}
                  testId={`${testId}-interactive`}
                >
                  Interactive {minutes} min
                </Button>
                {/* What this does and does not do: applied now if awake, held if not, never a wake. */}
                <Disclosure
                  text={INTERACTIVE_REQUEST_NOTE}
                  label="What asking for interactive does"
                  testId={`${testId}-interactive-why`}
                />
              </div>
              <div className="segmented" role="group" aria-label="Interactive window">
                {INTERACTIVE_MINUTES.map((option) => (
                  <button
                    type="button"
                    key={option}
                    aria-pressed={minutes === option}
                    onClick={() => setMinutes(option)}
                    data-testid={`power-window-${option}`}
                  >
                    {option}′
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/*
        The one physical fact a person needs when the panel is not answering,
        said plainly: which button. Only BOOT wakes it from deep sleep; the
        other buttons do nothing until it is awake. The header notices a wake
        within a few seconds (the tower's presence watch), so there is no need
        to press Check now afterwards.
      */}
      {!awake && (
        <p className="wake-hint" data-testid={`${testId}-wake-hint`}>
          <strong>To wake it now:</strong> press the round <strong>BOOT</strong> button on
          the panel. This page shows <em>Awake</em> within a few seconds.
        </p>
      )}
    </Card>
    </div>
  );
}
