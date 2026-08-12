import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Client, Settings } from "../data/types";

const commands = vi.hoisted(() => ({
  accountExists: vi.fn(),
  resumeSession: vi.fn(),
  listClients: vi.fn(),
  getRunningTimer: vi.fn(),
  // The window frame carries the block's lifecycle now, lock screen included —
  // it is watching nothing there, but it is still mounted (ADR-0010).
  listProjects: vi.fn(),
  startRunningTimer: vi.fn(),
  stopRunningTimer: vi.fn(),
  pauseRunningTimer: vi.fn(),
  resumeRunningTimer: vi.fn(),
  discardRunningTimer: vi.fn(),
  getSettings: vi.fn(),
  syncTray: vi.fn(),
  createAccount: vi.fn(),
  createClient: vi.fn(),
  createProject: vi.fn(),
  updateSettings: vi.fn(),
  restoreOutcome: vi.fn(),
  claimRestoreRelock: vi.fn(),
}));
vi.mock("../data/commands", () => commands);
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const { Gate } = await import("./gate");

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

const acme: Client = {
  id: 3,
  name: "Acme",
  notes: null,
  archivedAt: null,
  createdAt: "2026-08-05T12:00:00Z",
  updatedAt: "2026-08-05T12:00:00Z",
};

function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n("nl")}>
        <Gate>
          <p>de app zelf</p>
        </Gate>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const theApp = () => screen.queryByText("de app zelf");

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  commands.accountExists.mockResolvedValue(true);
  commands.resumeSession.mockResolvedValue(false);
  commands.restoreOutcome.mockResolvedValue({ status: "nothing" });
  commands.claimRestoreRelock.mockResolvedValue(false);
  commands.listClients.mockResolvedValue([acme]);
  commands.getRunningTimer.mockResolvedValue(null);
  commands.listProjects.mockResolvedValue([]);
  commands.getSettings.mockResolvedValue(settings);
  commands.syncTray.mockResolvedValue(undefined);
  commands.createAccount.mockResolvedValue(undefined);
  commands.createClient.mockResolvedValue(acme);
  commands.createProject.mockResolvedValue(undefined);
  commands.updateSettings.mockResolvedValue(settings);
});

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

/** The whole three-step walk, as someone setting up would do it. */
async function walkTheWizard() {
  await screen.findByLabelText("TimeBuddy vergrendelen");
  type("Wachtwoord", "correct horse");
  type("Herstelzin", "blue horse battery staple");
  press("Volgende");

  await screen.findByLabelText("Waar back-ups komen");
  press("Volgende");

  await screen.findByLabelText("Je eerste werk");
  type("Klant", "Acme");
  type("Project", "Website");
  press("Aan de slag");
}

describe("which door the app opens with", () => {
  it("walks the wizard when this install has never been set up", async () => {
    commands.accountExists.mockResolvedValue(false);
    renderGate();

    expect(
      await screen.findByLabelText("TimeBuddy vergrendelen"),
    ).toBeInTheDocument();
    expect(theApp()).toBeNull();
  });

  it("asks for the password when there is an account", async () => {
    renderGate();

    expect(
      await screen.findByLabelText("TimeBuddy ontgrendelen"),
    ).toBeInTheDocument();
    expect(theApp()).toBeNull();
  });

  it("lets the app through once the door is open and setup is done", async () => {
    window.localStorage.setItem("timebuddy.session", "remembered");
    commands.resumeSession.mockResolvedValue(true);
    renderGate();

    expect(await screen.findByText("de app zelf")).toBeInTheDocument();
  });
});

describe("finishing setup", () => {
  it("lands in the app, without waiting for a restart", async () => {
    // The wizard has just written the Client that says setup is done. Asking
    // again would be a round trip to be told what this render already knows —
    // and, once, a blank window until the app was restarted.
    commands.accountExists.mockResolvedValue(false);
    commands.listClients.mockResolvedValue([]);
    renderGate();

    await walkTheWizard();

    expect(await screen.findByText("de app zelf")).toBeInTheDocument();
  });

  it("does not put the wizard back up over the app it just filled", async () => {
    commands.accountExists.mockResolvedValue(false);
    commands.listClients.mockResolvedValue([]);
    renderGate();

    await walkTheWizard();
    await screen.findByText("de app zelf");

    expect(screen.queryByLabelText("Waar back-ups komen")).toBeNull();
    expect(screen.queryByLabelText("Je eerste werk")).toBeNull();
  });

  it("lands in the app when a resumed wizard finishes too", async () => {
    window.localStorage.setItem("timebuddy.session", "remembered");
    commands.resumeSession.mockResolvedValue(true);
    commands.listClients.mockResolvedValue([]);
    renderGate();

    await screen.findByLabelText("Waar back-ups komen");
    press("Volgende");
    await screen.findByLabelText("Je eerste werk");
    type("Klant", "Acme");
    type("Project", "Website");
    press("Aan de slag");

    expect(await screen.findByText("de app zelf")).toBeInTheDocument();
  });
});

describe("setup that was abandoned halfway", () => {
  /** Unlocked, but the wizard never reached the first client. */
  function abandonedAfterThePassword() {
    window.localStorage.setItem("timebuddy.session", "remembered");
    commands.resumeSession.mockResolvedValue(true);
    commands.listClients.mockResolvedValue([]);
  }

  it("resumes the wizard rather than landing on five empty screens", async () => {
    abandonedAfterThePassword();
    renderGate();

    expect(
      await screen.findByLabelText("Waar back-ups komen"),
    ).toBeInTheDocument();
    expect(theApp()).toBeNull();
  });

  it("picks up after the password, not over the account already made", async () => {
    abandonedAfterThePassword();
    renderGate();

    await screen.findByLabelText("Waar back-ups komen");

    expect(screen.getByText("Stap 2 van 3")).toBeInTheDocument();
    expect(screen.queryByLabelText("Herstelzin")).toBeNull();
  });

  it("counts an archived client as setup having finished", async () => {
    // Clients are archived, never deleted — so "none at all" can only mean
    // step three was never reached.
    window.localStorage.setItem("timebuddy.session", "remembered");
    commands.resumeSession.mockResolvedValue(true);
    commands.listClients.mockResolvedValue([
      { ...acme, archivedAt: "2026-08-06T09:00:00Z" },
    ]);
    renderGate();

    expect(await screen.findByText("de app zelf")).toBeInTheDocument();
  });

  it("does not re-run setup when the clients cannot be read", async () => {
    // Overwriting data that may well be there is the worse of two answers.
    window.localStorage.setItem("timebuddy.session", "remembered");
    commands.resumeSession.mockResolvedValue(true);
    commands.listClients.mockRejectedValue({ kind: "database", message: "x" });
    renderGate();

    expect(await screen.findByText("de app zelf")).toBeInTheDocument();
  });
});

describe("the window behind the lock screen", () => {
  it("still has its chrome, so the app can be moved and quit", async () => {
    const { container } = renderGate();

    await screen.findByLabelText("TimeBuddy ontgrendelen");

    expect(container.querySelector("header")).toHaveAttribute(
      "data-tauri-drag-region",
    );
    expect(screen.getByRole("button", { name: "Sluiten" })).toBeInTheDocument();
  });

  it("says nothing about the work being done before the door opens", async () => {
    // A countdown on the titlebar would answer the question the door asks.
    commands.getRunningTimer.mockResolvedValue({
      projectId: 7,
      startAt: new Date(Date.now() - 60_000).toISOString(),
      plannedMinutes: 25,
    });
    renderGate();

    await screen.findByLabelText("TimeBuddy ontgrendelen");

    expect(screen.queryByRole("timer")).toBeNull();
    expect(commands.getRunningTimer).not.toHaveBeenCalled();
  });
});
