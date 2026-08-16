/**
 * What happens to a running block when the user walks around the app.
 *
 * The other timer tests render the Timer screen on its own, which is the one
 * arrangement that cannot show this: every screen is a child route
 * (`router.tsx`), so navigating unmounts it, and whatever the block's lifecycle
 * kept in that component goes with it. So this file drives the real route tree
 * over a memory history and navigates for real — the boundary under test *is*
 * the `<Outlet/>`, and a test that rebuilt the tree itself could not fail when
 * something moved back across it (ADR-0010).
 *
 * One faked `invoke` rather than a mocked command module, so the whole shell —
 * titlebar, tray, banners — runs as shipped.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Project, RunningTimer, Settings } from "../data/types";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** No event bus in jsdom; `use-tray` tolerates the rejection on its own. */
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.reject(new Error("no tauri")),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ close: vi.fn(), minimize: vi.fn() }),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => Promise.resolve(null),
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

const chime = vi.hoisted(() => ({ playChime: vi.fn() }));
vi.mock("../timer/chime", () => chime);
const notify = vi.hoisted(() => ({ notify: vi.fn(() => Promise.resolve()) }));
vi.mock("../timer/notify", () => notify);

const { routeTree } = await import("../router");
const { clearTimerPause, requestTimerPause } =
  await import("../tray/toggle-request");

/**
 * A one-minute block, so that running one out costs the suite sixty ticks
 * rather than fifteen hundred. Nothing here depends on the length being 25.
 */
const BLOCK_MINUTES = 1;

const settings: Settings = {
  theme: "walnut",
  followSystem: false,
  language: "nl",
  pomodoroMinutes: BLOCK_MINUTES,
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

/** The `running_timer` row, as far as this test is concerned. */
let running: RunningTimer | null = null;
let stopped: Record<string, unknown> | null = null;

const responses: Record<string, (args: any) => unknown> = {
  get_settings: () => settings,
  list_projects: () => [website],
  list_time_entries: () => [],
  list_clients: () => [],
  get_running_timer: () => running,
  start_running_timer: ({ projectId, plannedMinutes }) => {
    running = {
      projectId,
      startAt: new Date().toISOString(),
      plannedMinutes,
      pausedAt: null,
      pausedSeconds: 0,
    };
    return running;
  },
  pause_running_timer: () => {
    if (running && running.pausedAt === null) {
      running = { ...running, pausedAt: new Date().toISOString() };
    }
    return running;
  },
  resume_running_timer: () => {
    if (running?.pausedAt) {
      running = {
        ...running,
        pausedSeconds:
          running.pausedSeconds +
          Math.max(0, (Date.now() - Date.parse(running.pausedAt)) / 1000),
        pausedAt: null,
      };
    }
    return running;
  },
  stop_running_timer: ({ stop }) => {
    stopped = stop;
    running = null;
    return { id: 1 };
  },
  discard_running_timer: () => {
    running = null;
  },
  backup_status: () => ({
    folder: "C:/backups",
    lastBackupAt: new Date().toISOString(),
    stale: false,
  }),
  run_backup: () => ({
    folder: "C:/backups",
    lastBackupAt: new Date().toISOString(),
    stale: false,
  }),
  restore_outcome: () => ({ status: "none" }),
  pending_restore: () => null,
  sync_tray: () => undefined,
};

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n("nl")}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

/** "Vandaag" heads today's entries, which the Timer screen always renders. */
const onTimerScreen = () => screen.queryByText("Vandaag");

async function leaveTheTimer() {
  fireEvent.click(screen.getByRole("tab", { name: "Klanten" }));
  await waitFor(() => expect(onTimerScreen()).toBeNull());
}

async function returnToTheTimer() {
  fireEvent.click(screen.getByRole("tab", { name: "Timer" }));
  await waitFor(() => expect(onTimerScreen()).not.toBeNull());
}

async function startABlock() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await screen.findByRole("button", { name: "Stop" });
}

/** Lets `now` move, which is the only thing that advances a block. */
const passes = (seconds: number) =>
  act(() => vi.advanceTimersByTimeAsync(seconds * 1000));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  running = null;
  stopped = null;
  clearTimerPause();
  invoke.mockImplementation((name: string, args: unknown) => {
    const respond = responses[name];
    return respond
      ? Promise.resolve(respond(args ?? {}))
      : Promise.reject(new Error(`unexpected command: ${name}`));
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("walking away from a running block and coming back", () => {
  it("is still the block this session started, not one found on the floor", async () => {
    renderApp();
    await startABlock();

    await leaveTheTimer();
    await returnToTheTimer();

    // The prompt is for a block this process did not start. This one it did.
    expect(screen.queryByText("Er liep nog een blok")).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Stop" }),
    ).toBeInTheDocument();
  });

  it("never offers to throw away work that is still being done", async () => {
    renderApp();
    await startABlock();

    await leaveTheTimer();
    await returnToTheTimer();

    expect(screen.queryByRole("button", { name: "Weggooien" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bewaren" })).toBeNull();
  });

  it("shows what is left of the block, not its nominal length again", async () => {
    renderApp();
    await startABlock();
    await passes(20);

    await leaveTheTimer();
    await returnToTheTimer();

    // The pill never stopped counting, so the dial has to agree with it — and
    // neither may have gone back to saying a whole block is left.
    await waitFor(() => {
      const remaining = screen.getByRole("timer").textContent as string;
      expect(remaining).not.toBe("01:00");
      expect(
        screen.getAllByText(remaining),
        "the dial and the pill disagree about the block",
      ).toHaveLength(2);
    });
  });
});

describe("a block that runs out while another screen is open", () => {
  it("is logged where it ended, without waiting to be looked at", async () => {
    renderApp();
    await startABlock();
    await leaveTheTimer();

    await passes(BLOCK_MINUTES * 60);

    await waitFor(() => expect(stopped).not.toBeNull());
    expect(stopped).toMatchObject({ durationMinutes: BLOCK_MINUTES });
  });

  it("says so, wherever the user happens to be", async () => {
    renderApp();
    await startABlock();
    await leaveTheTimer();

    await passes(BLOCK_MINUTES * 60);

    await waitFor(() => expect(chime.playChime).toHaveBeenCalled());
    expect(notify.notify).toHaveBeenCalled();
  });
});

describe("a paused block", () => {
  it("is still paused after a walk around the app, and says so everywhere", async () => {
    renderApp();
    await startABlock();
    fireEvent.click(screen.getByRole("button", { name: "Pauzeer" }));
    await screen.findByText("Gepauzeerd");

    await leaveTheTimer();
    // The pill is above the `<Outlet/>`, so it is the one thing on screen while
    // the Timer is not — and a still countdown there is what reads as a crash.
    expect(screen.getByRole("timer").textContent).toContain("gepauzeerd");

    await returnToTheTimer();

    expect(await screen.findByText("Gepauzeerd")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Doorgaan" }),
    ).toBeInTheDocument();
  });

  it("is held from the tray without moving the user off the screen they are on", async () => {
    // The tray's Pause item asks nothing of any screen (ADR-0010), so unlike
    // Start/Stop it does not bring the Timer up — and the pill, which is above
    // the `<Outlet/>`, is what reports that it landed.
    renderApp();
    await startABlock();
    await leaveTheTimer();

    act(() => requestTimerPause());

    await waitFor(() =>
      expect(screen.getByRole("timer").textContent).toContain("gepauzeerd"),
    );
    expect(onTimerScreen()).toBeNull();
  });

  it("does not run out while it is held, wherever the user is", async () => {
    renderApp();
    await startABlock();
    fireEvent.click(screen.getByRole("button", { name: "Pauzeer" }));
    await screen.findByText("Gepauzeerd");
    await leaveTheTimer();

    await passes(BLOCK_MINUTES * 60 * 3);

    expect(stopped).toBeNull();
    expect(chime.playChime).not.toHaveBeenCalled();
  });
});

describe("a Break in progress", () => {
  it("survives the user walking away from the Timer screen", async () => {
    renderApp();
    await startABlock();

    await passes(BLOCK_MINUTES * 60);
    expect(await screen.findByText("Pauze")).toBeInTheDocument();

    await leaveTheTimer();
    await returnToTheTimer();

    expect(await screen.findByText("Pauze")).toBeInTheDocument();
  });
});

describe("the floating tab bar", () => {
  it("renders five tabs, all reachable", async () => {
    renderApp();

    await waitFor(() =>
      expect(screen.getAllByRole("tab")).toHaveLength(5),
    );
  });

  it("marks the active tab and gives it its label", async () => {
    renderApp();

    await waitFor(() => {
      const tabs = screen.getAllByRole("tab");
      const selected = tabs.filter(
        (tab) => tab.getAttribute("aria-selected") === "true",
      );
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveTextContent("Timer");
    });
  });

  it("navigates when a tab is clicked", async () => {
    renderApp();

    await waitFor(() =>
      expect(screen.getAllByRole("tab")).toHaveLength(5),
    );

    fireEvent.click(screen.getByRole("tab", { name: /Klanten/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { selected: true }),
      ).toHaveTextContent("Klanten"),
    );
  });

  it("moves the active label to the clicked tab", async () => {
    renderApp();

    await waitFor(() =>
      expect(screen.getAllByRole("tab")).toHaveLength(5),
    );

    fireEvent.click(screen.getByRole("tab", { name: /Rapport/i }));
    await waitFor(() => {
      const selected = screen
        .getAllByRole("tab")
        .filter((tab) => tab.getAttribute("aria-selected") === "true");
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveTextContent("Rapport");
    });
  });
});
