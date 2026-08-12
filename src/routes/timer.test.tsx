import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Project, RunningTimer, Settings, TimeEntry } from "../data/types";

const commands = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listProjects: vi.fn(),
  listTimeEntries: vi.fn(),
  getRunningTimer: vi.fn(),
  startRunningTimer: vi.fn(),
  stopRunningTimer: vi.fn(),
  discardRunningTimer: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const chime = vi.hoisted(() => ({ playChime: vi.fn() }));
vi.mock("../timer/chime", () => chime);

const notify = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("../timer/notify", () => notify);

const { Timer } = await import("./timer");
const { TimerLifecycleProvider } = await import("../timer/lifecycle");
const { UNDO_WINDOW_MS } = await import("../entries/use-undoable-delete");
const { clearTimerToggle, requestTimerToggle } = await import(
  "../tray/toggle-request"
);

const settings: Settings = {
  theme: "walnut",
  followSystem: false,
  language: "nl",
  pomodoroMinutes: 25,
  breakMinutes: 5,
  chimeEnabled: true,
  notificationsEnabled: true,
  autostart: false,
  backupFolder: null,
  updatedAt: "2026-08-05T12:00:00Z",
};

const website: Project = {
  id: 7,
  clientId: 1,
  name: "Website",
  hourlyRate: null,
  archivedAt: null,
  createdAt: "2026-08-01T09:00:00Z",
  updatedAt: "2026-08-01T09:00:00Z",
};

/** A block that started `minutes` ago, measured against the real clock. */
function inFlight(minutes: number): RunningTimer {
  return {
    projectId: website.id,
    startAt: new Date(Date.now() - minutes * 60_000).toISOString(),
    plannedMinutes: 25,
  };
}

/**
 * The screen with the lifecycle it reads, which in the app is supplied by the
 * window frame above the `<Outlet/>` (ADR-0010). Mounted together here because
 * these tests are about what the screen does with a block, not about where the
 * block lives — `timer-navigation.test.tsx` is the one that tests the boundary.
 */
function renderTimer(language: "nl" | "en" = "nl") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n(language)}>
        <TimerLifecycleProvider watching>
          <Timer />
        </TimerLifecycleProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

/** Waits for the queries to land — the button is disabled until they do. */
async function clickStart() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
}

/**
 * Fake timers throughout, because a manual stop now waits five seconds before
 * it is written (#34) and no test should sit through them.
 */
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  clearTimerToggle();
  commands.getSettings.mockResolvedValue(settings);
  commands.listProjects.mockResolvedValue([website]);
  commands.listTimeEntries.mockResolvedValue([]);
  commands.getRunningTimer.mockResolvedValue(null);
  commands.startRunningTimer.mockResolvedValue(inFlight(0));
  commands.stopRunningTimer.mockResolvedValue({} as TimeEntry);
  commands.discardRunningTimer.mockResolvedValue(undefined);
  // The settings row remembers what was written to it, so that a preset can be
  // observed to stick rather than only to have been sent.
  let stored: Settings = settings;
  commands.getSettings.mockImplementation(() => Promise.resolve(stored));
  commands.updateSettings.mockImplementation((next: Settings) => {
    stored = next;
    return Promise.resolve(next);
  });
  notify.notify.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the idle Timer screen", () => {
  it("offers one big start button, a project and today's entries", async () => {
    renderTimer();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start" })).toBeEnabled(),
    );
    expect(await screen.findByLabelText("Project")).toHaveValue("7");
    expect(screen.getByText("Vandaag")).toBeInTheDocument();
    expect(screen.getByText("Nog geen uren geregistreerd.")).toBeInTheDocument();
  });

  it("shows the configured block length on the dial", async () => {
    commands.getSettings.mockResolvedValue({
      ...settings,
      pomodoroMinutes: 50,
    });
    renderTimer();

    expect(await screen.findByText("50:00")).toBeInTheDocument();
  });

  it("renders English when the language is en", async () => {
    renderTimer("en");

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("No hours logged yet.")).toBeInTheDocument();
  });

  it("starts a block on the picked project, at the configured length", async () => {
    renderTimer();

    await clickStart();

    await waitFor(() =>
      expect(commands.startRunningTimer).toHaveBeenCalledWith(7, 25),
    );
  });

  it("cannot start without a project to start on", async () => {
    commands.listProjects.mockResolvedValue([]);
    renderTimer();

    expect(await screen.findByText("Maak eerst een project aan.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("still names today's hours on a project that has since been archived", async () => {
    commands.listProjects.mockImplementation(
      ({ includeArchived }: { includeArchived: boolean }) =>
        Promise.resolve(includeArchived ? [website] : []),
    );
    commands.listTimeEntries.mockResolvedValue([
      {
        id: 1,
        projectId: website.id,
        date: "2026-08-05",
        durationMinutes: 25,
        startAt: null,
        endAt: null,
        note: null,
        source: "manual",
        createdAt: "2026-08-05T09:25:00Z",
        updatedAt: "2026-08-05T09:25:00Z",
      },
    ]);
    renderTimer();

    // No longer startable, still named.
    expect(await screen.findByText("Maak eerst een project aan.")).toBeVisible();
    expect(await screen.findByRole("listitem")).toHaveTextContent(website.name);
  });

  it("lists today's entries with the window they ran in", async () => {
    commands.listTimeEntries.mockResolvedValue([
      {
        id: 1,
        projectId: website.id,
        date: "2026-08-05",
        durationMinutes: 25,
        startAt: new Date(2026, 7, 5, 9, 0).toISOString(),
        endAt: new Date(2026, 7, 5, 9, 25).toISOString(),
        note: null,
        source: "timer",
        createdAt: "2026-08-05T09:25:00Z",
        updatedAt: "2026-08-05T09:25:00Z",
      } satisfies TimeEntry,
    ]);
    renderTimer();

    // Scoped to the list: "Website" is also an option in the picker.
    const logged = await screen.findByRole("listitem");
    expect(logged).toHaveTextContent("Website");
    expect(logged).toHaveTextContent("25 min");
    expect(logged).toHaveTextContent("09:00–09:25");
  });
});

describe("a block found in flight on launch", () => {
  it("asks rather than deciding, and never starts counting again", async () => {
    commands.getRunningTimer.mockResolvedValue(inFlight(10));
    renderTimer();

    expect(await screen.findByText("Er liep nog een blok")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bewaren" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(commands.stopRunningTimer).not.toHaveBeenCalled();
    expect(commands.discardRunningTimer).not.toHaveBeenCalled();
  });

  it("offers back the elapsed time, not the nominal length", async () => {
    commands.getRunningTimer.mockResolvedValue(inFlight(10));
    renderTimer();

    fireEvent.click(await screen.findByRole("button", { name: "Bewaren" }));

    await waitFor(() =>
      expect(commands.stopRunningTimer).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 10 }),
      ),
    );
  });

  it("offers a block that ran out while the app was gone at its full length", async () => {
    // Killed at ten minutes, relaunched two hours later: the block finished
    // at 25 minutes, and the two hours are not work.
    const block = inFlight(120);
    commands.getRunningTimer.mockResolvedValue(block);
    renderTimer();

    fireEvent.click(await screen.findByRole("button", { name: "Bewaren" }));

    await waitFor(() =>
      expect(commands.stopRunningTimer).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMinutes: 25,
          endAt: new Date(Date.parse(block.startAt) + 25 * 60_000)
            .toISOString()
            .replace(/\.\d{3}Z$/, "Z"),
        }),
      ),
    );
  });

  it("freezes what it offers instead of counting on while it waits", async () => {
    // The question must not answer itself. Two minutes spent reading the
    // prompt are two minutes the app was not being worked in.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      commands.getRunningTimer.mockResolvedValue(inFlight(10));
      renderTimer();
      const keep = await screen.findByRole("button", { name: "Bewaren" });

      await act(() => vi.advanceTimersByTimeAsync(120_000));
      fireEvent.click(keep);

      await waitFor(() =>
        expect(commands.stopRunningTimer).toHaveBeenCalledWith(
          expect.objectContaining({ durationMinutes: 10 }),
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes nothing at all when the answer is discard", async () => {
    commands.getRunningTimer.mockResolvedValue(inFlight(10));
    renderTimer();

    fireEvent.click(
      await screen.findByRole("button", { name: "Weggooien" }),
    );

    await waitFor(() =>
      expect(commands.discardRunningTimer).toHaveBeenCalled(),
    );
    expect(commands.stopRunningTimer).not.toHaveBeenCalled();
  });

  it("has nothing to keep when the block barely ran", async () => {
    commands.getRunningTimer.mockResolvedValue(inFlight(0));
    renderTimer();

    expect(
      await screen.findByText("Er was te weinig tijd verstreken om te bewaren."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bewaren" })).toBeNull();
  });
});

/** Nothing in flight on launch; the block appears once Start has been hit. */
function appearsAfterStart(block: RunningTimer) {
  commands.getRunningTimer.mockResolvedValueOnce(null).mockResolvedValue(block);
}

describe("a block this session started", () => {
  it("counts down and offers to stop, without asking anything", async () => {
    appearsAfterStart(inFlight(1));
    renderTimer();
    await clickStart();

    expect(
      await screen.findByRole("button", { name: "Stop" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Er liep nog een blok")).toBeNull();
    expect(await screen.findByText("24:00")).toBeInTheDocument();
  });

  it("logs the actual elapsed time when stopped early", async () => {
    appearsAfterStart(inFlight(10));
    renderTimer();
    await clickStart();

    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    // Deferred for five seconds, in which it is still a question (#34).
    await act(() => vi.advanceTimersByTimeAsync(6000));

    await waitFor(() =>
      expect(commands.stopRunningTimer).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 10 }),
      ),
    );
  });

  it("stops itself at zero, so a block cannot run overnight", async () => {
    // The block runs out while nobody touches anything.
    appearsAfterStart(inFlight(25));
    renderTimer();
    await clickStart();

    await waitFor(() =>
      expect(commands.stopRunningTimer).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 25 }),
      ),
    );
  });
});

describe("Start/Stop pressed in the tray menu", () => {
  /** The menu item, which reaches this screen through the latch. */
  const clickMenuItem = () => act(() => requestTimerToggle());

  it("starts a block on the picked project, as the button would", async () => {
    renderTimer();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start" })).toBeEnabled(),
    );

    clickMenuItem();

    await waitFor(() =>
      expect(commands.startRunningTimer).toHaveBeenCalledWith(7, 25),
    );
  });

  it("stops a running block, logging what actually elapsed", async () => {
    appearsAfterStart(inFlight(10));
    renderTimer();
    await clickStart();
    await screen.findByRole("button", { name: "Stop" });

    clickMenuItem();
    await act(() => vi.advanceTimersByTimeAsync(6000));

    await waitFor(() =>
      expect(commands.stopRunningTimer).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 10 }),
      ),
    );
  });

  it("leaves a block found on launch to the prompt to decide", async () => {
    // The recovery prompt is a question. A menu item must not answer it on
    // the user's behalf, in either direction.
    commands.getRunningTimer.mockResolvedValue(inFlight(10));
    renderTimer();
    await screen.findByText("Er liep nog een blok");

    clickMenuItem();

    expect(commands.stopRunningTimer).not.toHaveBeenCalled();
    expect(commands.discardRunningTimer).not.toHaveBeenCalled();
    expect(commands.startRunningTimer).not.toHaveBeenCalled();
  });

  it("does nothing when there is no project to start on", async () => {
    commands.listProjects.mockResolvedValue([]);
    renderTimer();
    await screen.findByText("Maak eerst een project aan.");

    clickMenuItem();

    expect(commands.startRunningTimer).not.toHaveBeenCalled();
  });
});

describe("stopping a block by hand", () => {
  /** Runs out the five seconds in which the stop is still a question. */
  const letTheWindowClose = () =>
    act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100));

  async function stopAfter(minutes: number) {
    appearsAfterStart(inFlight(minutes));
    renderTimer();
    await clickStart();
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
  }

  it("says what it is about to log, and has not logged it yet", async () => {
    await stopAfter(10);

    expect(await screen.findByText("10 min geregistreerd.")).toBeInTheDocument();
    expect(commands.stopRunningTimer).not.toHaveBeenCalled();
  });

  it("presents the block as stopped while the question stands", async () => {
    await stopAfter(10);

    await screen.findByText("10 min geregistreerd.");
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  });

  it("writes nothing at all when the stop is undone", async () => {
    await stopAfter(10);

    fireEvent.click(
      await screen.findByRole("button", { name: "Ongedaan maken" }),
    );
    await letTheWindowClose();

    expect(commands.stopRunningTimer).not.toHaveBeenCalled();
    expect(commands.discardRunningTimer).not.toHaveBeenCalled();
  });

  it("leaves the block running when the stop is undone", async () => {
    await stopAfter(10);

    fireEvent.click(
      await screen.findByRole("button", { name: "Ongedaan maken" }),
    );

    expect(
      await screen.findByRole("button", { name: "Stop" }),
    ).toBeInTheDocument();
  });

  it("logs it once the five seconds are up", async () => {
    await stopAfter(10);
    await screen.findByText("10 min geregistreerd.");

    await letTheWindowClose();

    await waitFor(() =>
      expect(commands.stopRunningTimer).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 10 }),
      ),
    );
  });

  it("logs what was true when Stop was pressed, not when the toast expired", async () => {
    // The five seconds are the app's hesitation, not the user's work.
    await stopAfter(10);
    await screen.findByText("10 min geregistreerd.");

    await act(() => vi.advanceTimersByTimeAsync(120_000));

    await waitFor(() =>
      expect(commands.stopRunningTimer).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 10 }),
      ),
    );
  });

  it("offers nothing back for a block that barely ran", async () => {
    // Nothing is written, so there is nothing to undo, and a toast saying so
    // would be noise.
    await stopAfter(0);

    await waitFor(() => expect(commands.discardRunningTimer).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Ongedaan maken" })).toBeNull();
    expect(commands.stopRunningTimer).not.toHaveBeenCalled();
  });
});

describe("the duration presets", () => {
  const preset = (minutes: number) =>
    screen.getByRole("button", { name: `Blok van ${minutes} minuten` });

  it("offers the four lengths, and marks the one in force", async () => {
    renderTimer();

    await waitFor(() => expect(preset(25)).toHaveAttribute("aria-pressed", "true"));
    for (const minutes of [15, 45, 60]) {
      expect(preset(minutes)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("marks none of them when the saved length is not one of the four", async () => {
    commands.getSettings.mockResolvedValue({ ...settings, pomodoroMinutes: 50 });
    renderTimer();

    await screen.findByText("50:00");
    for (const minutes of [15, 25, 45, 60]) {
      expect(preset(minutes)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("saves the picked length as the block length from now on", async () => {
    // Settings is still written as one row (CONTEXT.md) — a preset changes one
    // field of it, it does not invent a second way to store a duration.
    renderTimer();
    await waitFor(() => expect(preset(15)).toBeEnabled());

    fireEvent.click(preset(15));

    await waitFor(() =>
      expect(commands.updateSettings).toHaveBeenCalledWith({
        ...settings,
        pomodoroMinutes: 15,
      }),
    );
  });

  it("shows the picked length on the dial straight away", async () => {
    renderTimer();
    await waitFor(() => expect(preset(45)).toBeEnabled());

    fireEvent.click(preset(45));

    expect(await screen.findByText("45:00")).toBeInTheDocument();
  });

  it("starts the next block at the picked length", async () => {
    renderTimer();
    await waitFor(() => expect(preset(15)).toBeEnabled());
    fireEvent.click(preset(15));
    await screen.findByText("15:00");

    await clickStart();

    await waitFor(() =>
      expect(commands.startRunningTimer).toHaveBeenCalledWith(7, 15),
    );
  });

  it("cannot move the finish line of a block already under way", async () => {
    // `planned_minutes` is frozen at start, so a live preset would be a control
    // whose effect cannot be seen until the next block.
    appearsAfterStart(inFlight(1));
    renderTimer();
    await clickStart();
    await screen.findByRole("button", { name: "Stop" });

    expect(preset(15)).toBeDisabled();
    expect(preset(60)).toBeDisabled();
    expect(commands.updateSettings).not.toHaveBeenCalled();
  });

  it("is absent while an orphaned block is being asked about", async () => {
    commands.getRunningTimer.mockResolvedValue(inFlight(10));
    renderTimer();
    await screen.findByText("Er liep nog een blok");

    expect(
      screen.queryByRole("button", { name: "Blok van 15 minuten" }),
    ).toBeNull();
  });

  it("says so when the length could not be saved", async () => {
    // Silence would leave the dial saying 15 while the next block ran 25.
    commands.updateSettings.mockRejectedValue(new Error("nope"));
    renderTimer();
    await waitFor(() => expect(preset(15)).toBeEnabled());

    fireEvent.click(preset(15));

    expect(
      await screen.findByText("Die bloklengte kon niet worden opgeslagen."),
    ).toBeInTheDocument();
  });
});

describe("saying that a block has ended", () => {
  /** Runs a block out with the settings the test asks for. */
  async function finishBlock(preferences: Partial<Settings> = {}) {
    commands.getSettings.mockResolvedValue({ ...settings, ...preferences });
    appearsAfterStart(inFlight(25));
    renderTimer();
    await clickStart();

    await waitFor(() => expect(commands.stopRunningTimer).toHaveBeenCalled());
  }

  it("chimes and notifies, which is what both switches ship as", async () => {
    await finishBlock();

    expect(chime.playChime).toHaveBeenCalled();
    expect(notify.notify).toHaveBeenCalledWith(
      "TimeBuddy",
      expect.stringContaining("25 min"),
    );
  });

  it("stays quiet when the chime is switched off", async () => {
    await finishBlock({ chimeEnabled: false });

    expect(chime.playChime).not.toHaveBeenCalled();
    // Switching one off says nothing about the other.
    expect(notify.notify).toHaveBeenCalled();
  });

  it("raises no notification when they are switched off", async () => {
    await finishBlock({ notificationsEnabled: false });

    expect(notify.notify).not.toHaveBeenCalled();
    expect(chime.playChime).toHaveBeenCalled();
  });
});
