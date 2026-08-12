import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { TrayLabels } from "../data/types";
import type { RunningBlock } from "../timer/lifecycle";

const commands = vi.hoisted(() => ({ syncTray: vi.fn() }));
vi.mock("../data/commands", () => commands);

const notice = vi.hoisted(() => ({ explainHiddenToTray: vi.fn() }));
vi.mock("./hidden-notice", () => notice);

/** The Tauri event bus, which in a test is a handler per name and a way to
 * fire it. */
const bus = vi.hoisted(() => {
  const handlers = new Map<string, Set<() => void>>();
  return {
    handlers,
    fire(name: string) {
      for (const handler of handlers.get(name) ?? []) handler();
    },
    listen: vi.fn((name: string, handler: () => void) => {
      const forName = handlers.get(name) ?? new Set<() => void>();
      forName.add(handler);
      handlers.set(name, forName);
      return Promise.resolve(() => forName.delete(handler));
    }),
  };
});
vi.mock("@tauri-apps/api/event", () => ({ listen: bus.listen }));

const { useTray, TOGGLE_TIMER_EVENT, TOGGLE_PAUSE_EVENT, HIDDEN_TO_TRAY_EVENT } =
  await import("./use-tray");

const idle: RunningBlock = { block: null, now: "2026-08-05T12:00:00Z" };

/** A block ten minutes into its twenty-five. */
const inFlight: RunningBlock = {
  block: {
    projectId: 7,
    startAt: "2026-08-05T12:00:00Z",
    plannedMinutes: 25,
    pausedAt: null,
    pausedSeconds: 0,
  },
  now: "2026-08-05T12:10:00Z",
};

/** The same block, held five minutes in and read five minutes later. */
const held: RunningBlock = {
  block: { ...inFlight.block!, pausedAt: "2026-08-05T12:05:00Z" },
  now: "2026-08-05T12:10:00Z",
};

function renderTray(
  running: RunningBlock = idle,
  {
    onToggle = vi.fn(),
    onPause = vi.fn(),
    language = "en",
    orphaned = false,
  }: {
    onToggle?: () => void;
    onPause?: () => void;
    language?: "nl" | "en";
    orphaned?: boolean;
  } = {},
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={createI18n(language)}>{children}</I18nextProvider>
  );
  return renderHook(
    ({ block }: { block: RunningBlock }) =>
      useTray(block, {
        orphaned,
        onToggleRequested: onToggle,
        onPauseRequested: onPause,
      }),
    { wrapper, initialProps: { block: running } },
  );
}

/** The labels of the most recent sync. */
function lastSync(): TrayLabels {
  const calls = commands.syncTray.mock.calls;
  expect(calls.length, "the tray was never synced").toBeGreaterThan(0);
  return calls[calls.length - 1][0] as TrayLabels;
}

beforeEach(() => {
  vi.clearAllMocks();
  bus.handlers.clear();
  commands.syncTray.mockResolvedValue(undefined);
});

describe("what the tray says", () => {
  it("names its menu from the catalogues, in the app's language", async () => {
    renderTray();

    await waitFor(() =>
      expect(lastSync()).toMatchObject({
        show: "Show TimeBuddy",
        toggle: "Start timer",
        pause: "Pause timer",
        quit: "Quit",
        tooltip: "TimeBuddy",
      }),
    );
  });

  it("greys the Pause item while there is no block to hold", async () => {
    renderTray();

    await waitFor(() => expect(lastSync().pauseEnabled).toBe(false));
  });

  it("greys it for a block that is waiting on the recovery question", async () => {
    // The menu never answers that question, in either direction — so there is
    // nothing this item could do, and it says so rather than swallowing a click.
    renderTray(inFlight, { orphaned: true });

    await waitFor(() => expect(lastSync().pauseEnabled).toBe(false));
    // The tooltip still counts: the block is real, and hiding it would be a
    // second decision about a question that has not been answered.
    expect(lastSync().tooltip).toBe("15 min left");
  });

  it("says it in Dutch when the app is in Dutch", async () => {
    renderTray(idle, { language: "nl" });

    await waitFor(() => expect(lastSync().quit).toBe("Afsluiten"));
  });

  it("offers to stop, and counts down, while a block runs", async () => {
    renderTray(inFlight);

    await waitFor(() =>
      expect(lastSync()).toMatchObject({
        toggle: "Stop timer",
        pause: "Pause timer",
        pauseEnabled: true,
        tooltip: "15 min left",
      }),
    );
  });

  it("offers to resume, and says paused, while a block is held", async () => {
    renderTray(held);

    await waitFor(() =>
      expect(lastSync()).toMatchObject({
        // Stop is still Stop: a held block is ended the same way a running one
        // is, and it is the only item whose word does not change.
        toggle: "Stop timer",
        pause: "Resume timer",
        pauseEnabled: true,
        tooltip: "Paused — 20 min left",
      }),
    );
  });

  it("stays quiet while none of its words have changed", async () => {
    // The countdown ticks every second and the tooltip counts in whole
    // minutes: a hover nobody is doing is not worth a message a second.
    const { rerender } = renderTray(inFlight);
    await waitFor(() => expect(commands.syncTray).toHaveBeenCalledTimes(1));

    rerender({
      block: { ...inFlight, now: "2026-08-05T12:10:30Z" },
    });

    expect(commands.syncTray).toHaveBeenCalledTimes(1);
  });

  it("speaks up again once a whole minute has gone", async () => {
    const { rerender } = renderTray(inFlight);
    await waitFor(() => expect(lastSync().tooltip).toBe("15 min left"));

    rerender({ block: { ...inFlight, now: "2026-08-05T12:11:00Z" } });

    await waitFor(() => expect(lastSync().tooltip).toBe("14 min left"));
  });

  it("tries again after a sync that failed", async () => {
    // The words do not change while the app sits idle, so a first attempt
    // remembered as sent would be the only attempt ever made.
    commands.syncTray.mockRejectedValueOnce({ kind: "tray", message: "no" });
    const { rerender } = renderTray();

    await waitFor(() => expect(commands.syncTray).toHaveBeenCalledTimes(1));
    rerender({ block: idle });

    await waitFor(() => expect(commands.syncTray).toHaveBeenCalledTimes(2));
  });
});

describe("the Start/Stop menu item", () => {
  it("is heard on the event Rust emits", async () => {
    const onToggle = vi.fn();
    renderTray(idle, { onToggle });

    await waitFor(() =>
      expect(bus.handlers.get(TOGGLE_TIMER_EVENT)?.size).toBe(1),
    );
    bus.fire(TOGGLE_TIMER_EVENT);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("is not listened for twice when the countdown re-renders", async () => {
    const { rerender } = renderTray(inFlight);
    await waitFor(() =>
      expect(bus.handlers.get(TOGGLE_TIMER_EVENT)?.size).toBe(1),
    );

    rerender({ block: { ...inFlight, now: "2026-08-05T12:10:01Z" } });

    expect(bus.handlers.get(TOGGLE_TIMER_EVENT)?.size).toBe(1);
  });

  it("is let go of when the window's chrome goes", async () => {
    const { unmount } = renderTray();
    await waitFor(() =>
      expect(bus.handlers.get(TOGGLE_TIMER_EVENT)?.size).toBe(1),
    );

    unmount();

    await waitFor(() =>
      expect(bus.handlers.get(TOGGLE_TIMER_EVENT)?.size).toBe(0),
    );
  });
});

describe("the Pause menu item", () => {
  it("is heard on the event Rust emits for it, not the Start/Stop one", async () => {
    const onToggle = vi.fn();
    const onPause = vi.fn();
    renderTray(inFlight, { onToggle, onPause });

    await waitFor(() =>
      expect(bus.handlers.get(TOGGLE_PAUSE_EVENT)?.size).toBe(1),
    );
    bus.fire(TOGGLE_PAUSE_EVENT);

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("is let go of when the window's chrome goes", async () => {
    const { unmount } = renderTray();
    await waitFor(() =>
      expect(bus.handlers.get(TOGGLE_PAUSE_EVENT)?.size).toBe(1),
    );

    unmount();

    await waitFor(() =>
      expect(bus.handlers.get(TOGGLE_PAUSE_EVENT)?.size).toBe(0),
    );
  });
});

describe("a window that has gone into the tray", () => {
  it("explains itself, however it was closed", async () => {
    // Rust raises this after it hides, so Alt+F4 and the close button both
    // arrive here rather than only the one with a click handler.
    renderTray();

    await waitFor(() =>
      expect(bus.handlers.get(HIDDEN_TO_TRAY_EVENT)?.size).toBe(1),
    );
    bus.fire(HIDDEN_TO_TRAY_EVENT);

    expect(notice.explainHiddenToTray).toHaveBeenCalledWith({
      title: "TimeBuddy",
      body: expect.stringContaining("tray"),
    });
  });
});
