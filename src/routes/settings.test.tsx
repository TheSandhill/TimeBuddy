import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { BackupStatus, Settings as StoredSettings } from "../data/types";

const commands = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  backupStatus: vi.fn(),
  runBackup: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => dialog);

const { Settings } = await import("./settings");

const stored: StoredSettings = {
  theme: "walnut",
  followSystem: false,
  language: "nl",
  pomodoroMinutes: 25,
  breakMinutes: 5,
  chimeEnabled: true,
  notificationsEnabled: true,
  autostart: false,
  backupFolder: null,
  updatedAt: "2026-08-09T12:00:00Z",
};

const backedUp: BackupStatus = {
  folder: "C:\\Users\\test\\AppData\\Roaming\\TimeBuddy\\backups",
  lastBackupAt: "2026-08-09T07:30:00Z",
  kept: 7,
  due: false,
  stale: false,
};

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n("nl")}>
        <Settings />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

const check = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("checkbox", { name }));

const save = () => click("Opslaan");

/** Waits for the screen to have its settings before touching anything. */
const loaded = () => screen.findByRole("radio", { name: "Walnoot" });

beforeEach(() => {
  vi.clearAllMocks();
  commands.getSettings.mockResolvedValue(stored);
  commands.updateSettings.mockImplementation(async (next: StoredSettings) => next);
  commands.backupStatus.mockResolvedValue(backedUp);
  commands.runBackup.mockResolvedValue(backedUp);
  dialog.open.mockResolvedValue(null);
});

describe("picking a theme", () => {
  it("opens on the theme that is saved", async () => {
    commands.getSettings.mockResolvedValue({ ...stored, theme: "sand" });
    renderSettings();

    expect(await screen.findByRole("radio", { name: "Zand" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Walnoot" })).not.toBeChecked();
  });

  it("offers exactly the three shipped themes", async () => {
    renderSettings();
    await loaded();

    expect(screen.getAllByRole("radio").map((input) => input.getAttribute("value")))
      .toEqual(["walnut", "sand", "high-contrast"]);
  });

  it("saves the theme that was picked", async () => {
    renderSettings();
    await loaded();

    fireEvent.click(screen.getByRole("radio", { name: "Hoog contrast" }));
    save();

    await waitFor(() =>
      expect(commands.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "high-contrast" }),
      ),
    );
  });
});

describe("following the system", () => {
  it("is off on a fresh install", async () => {
    renderSettings();
    await loaded();

    expect(
      screen.getByRole("checkbox", { name: /Volg de licht\/donker/ }),
    ).not.toBeChecked();
  });

  it("takes the picker out of play while it is on, rather than ignoring it", async () => {
    renderSettings();
    await loaded();

    check(/Volg de licht\/donker/);

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
  });

  it("keeps the chosen theme in the row so turning it back off restores it", async () => {
    commands.getSettings.mockResolvedValue({ ...stored, theme: "high-contrast" });
    renderSettings();
    await screen.findByRole("radio", { name: "Hoog contrast" });

    check(/Volg de licht\/donker/);
    save();

    await waitFor(() =>
      expect(commands.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ followSystem: true, theme: "high-contrast" }),
      ),
    );
  });
});

describe("the rest of the preferences", () => {
  it("saves the language, the lengths and the toggles as one row", async () => {
    renderSettings();
    await loaded();

    fireEvent.change(screen.getByLabelText("Taal"), { target: { value: "en" } });
    fireEvent.change(screen.getByLabelText("Bloklengte (minuten)"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText("Pauzelengte (minuten)"), {
      target: { value: "10" },
    });
    check(/Geluid aan het eind/);
    check(/Windows-melding/);
    check(/TimeBuddy starten met Windows/);
    save();

    await waitFor(() =>
      expect(commands.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          language: "en",
          pomodoroMinutes: 50,
          breakMinutes: 10,
          chimeEnabled: false,
          notificationsEnabled: false,
          autostart: true,
        }),
      ),
    );
  });

  it("says what was rejected instead of pretending it saved", async () => {
    commands.updateSettings.mockRejectedValue({
      kind: "validation",
      code: "durationSettingNotPositive",
    });
    renderSettings();
    await loaded();

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vul een duur groter dan nul in.",
    );
  });

  it("says so when Windows refuses the startup entry", async () => {
    commands.updateSettings.mockRejectedValue({
      kind: "autostart",
      message: "access denied",
    });
    renderSettings();
    await loaded();

    check(/TimeBuddy starten met Windows/);
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Er is niets opgeslagen.",
    );
  });
});

describe("the backup folder", () => {
  it("says where backups go when nothing has been chosen", async () => {
    renderSettings();
    await loaded();

    expect(
      screen.getByText("De eigen datamap van de app"),
    ).toBeInTheDocument();
  });

  it("asks for a folder, not a file", async () => {
    dialog.open.mockResolvedValue("D:\\OneDrive\\TimeBuddy");
    renderSettings();
    await loaded();

    click("Kiezen…");

    await waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(dialog.open.mock.calls[0][0]).toMatchObject({ directory: true });
    expect(
      await screen.findByText("D:\\OneDrive\\TimeBuddy"),
    ).toBeInTheDocument();
  });

  it("changes nothing when the dialog is dismissed", async () => {
    commands.getSettings.mockResolvedValue({
      ...stored,
      backupFolder: "D:\\Backups",
    });
    renderSettings();
    await loaded();

    click("Kiezen…");

    await waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(screen.getByText("D:\\Backups")).toBeInTheDocument();
  });

  it("goes back to the default folder on request", async () => {
    commands.getSettings.mockResolvedValue({
      ...stored,
      backupFolder: "D:\\Backups",
    });
    renderSettings();
    await loaded();

    click("Standaard gebruiken");
    save();

    await waitFor(() =>
      expect(commands.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ backupFolder: null }),
      ),
    );
  });
});

describe("backups", () => {
  it("says when the last one was made and how many are kept", async () => {
    renderSettings();
    await loaded();

    expect(
      await screen.findByText(/Laatste back-up: .* — 7 bewaard\./),
    ).toBeInTheDocument();
  });

  it("says so plainly when there has never been one", async () => {
    commands.backupStatus.mockResolvedValue({
      ...backedUp,
      lastBackupAt: null,
      kept: 0,
      due: true,
      stale: true,
    });
    renderSettings();
    await loaded();

    expect(
      await screen.findByText("Er is nog geen back-up gemaakt."),
    ).toBeInTheDocument();
  });

  it("marks a backup that has gone stale, where someone comes to look", async () => {
    // The loud half of this is a banner, raised by a failed attempt. This half
    // is the one that is read rather than announced.
    commands.backupStatus.mockResolvedValue({ ...backedUp, stale: true });
    renderSettings();
    await loaded();

    expect(
      await screen.findByText(/langer geleden dan het zou moeten zijn/),
    ).toBeInTheDocument();
  });

  it("says nothing about staleness when the backups are current", async () => {
    renderSettings();
    await loaded();
    await screen.findByText(/Laatste back-up/);

    expect(
      screen.queryByText(/langer geleden dan het zou moeten zijn/),
    ).not.toBeInTheDocument();
  });

  it("makes one on request, without needing Save", async () => {
    // The button is an act, not an edit: there is nothing in the row to save.
    renderSettings();
    await loaded();

    click("Nu back-uppen");

    await waitFor(() => expect(commands.runBackup).toHaveBeenCalledTimes(1));
    expect(commands.updateSettings).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Back-up gemaakt",
    );
  });

  it("says a failed backup failed instead of looking like it worked", async () => {
    commands.runBackup.mockRejectedValue({
      kind: "backup",
      message: "D:\\ is not there",
    });
    renderSettings();
    await loaded();

    click("Nu back-uppen");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "De back-up kon niet worden geschreven.",
    );
  });

  it("shows the newly made backup's time without asking again", async () => {
    commands.backupStatus.mockResolvedValue({
      ...backedUp,
      lastBackupAt: null,
      kept: 0,
      due: true,
      stale: true,
    });
    commands.runBackup.mockResolvedValue({ ...backedUp, kept: 1 });
    renderSettings();
    await screen.findByText("Er is nog geen back-up gemaakt.");

    click("Nu back-uppen");

    expect(
      await screen.findByText(/Laatste back-up: .* — 1 bewaard\./),
    ).toBeInTheDocument();
    expect(commands.backupStatus).toHaveBeenCalledTimes(1);
  });
});
