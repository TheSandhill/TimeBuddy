import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Client } from "../data/types";

const commands = vi.hoisted(() => ({
  accountExists: vi.fn(),
  resumeSession: vi.fn(),
  listClients: vi.fn(),
  getRunningTimer: vi.fn(),
  getSettings: vi.fn(),
  syncTray: vi.fn(),
}));
vi.mock("../data/commands", () => commands);
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const { Gate } = await import("./gate");

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
  commands.listClients.mockResolvedValue([acme]);
  commands.getRunningTimer.mockResolvedValue(null);
  commands.getSettings.mockResolvedValue(null);
  commands.syncTray.mockResolvedValue(undefined);
});

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
