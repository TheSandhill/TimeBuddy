import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type {
  BackupStatus,
  RestorableBackup,
  RestorePreview,
  Settings as StoredSettings,
} from "../data/types";

const commands = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  backupStatus: vi.fn(),
  runBackup: vi.fn(),
  listRestorableBackups: vi.fn(),
  previewRestore: vi.fn(),
  stageRestore: vi.fn(),
  cancelRestore: vi.fn(),
  pendingRestore: vi.fn(),
  restoreOutcome: vi.fn(),
  claimRestoreRelock: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => dialog);

// The Updates section sits at the bottom of this screen. It has its own tests;
// here it is stubbed to "you are on the newest version", which is the answer
// that puts nothing on screen for the rest of these tests to trip over.
const updater = vi.hoisted(() => ({
  currentVersion: vi.fn().mockResolvedValue("0.1.0"),
  checkForUpdate: vi.fn().mockResolvedValue(null),
}));
vi.mock("../update/updater", () => updater);

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

const restorable: RestorableBackup[] = [
  { fileName: "timebuddy-20260809T073000Z.db", madeAt: "2026-08-09T07:30:00Z" },
  { fileName: "timebuddy-20260803T073000Z.db", madeAt: "2026-08-03T07:30:00Z" },
];

/** Restoring the older of the two would discard two and a half hours. */
const cost: RestorePreview = {
  fileName: "timebuddy-20260803T073000Z.db",
  madeAt: "2026-08-03T07:30:00Z",
  entriesSince: 3,
  minutesSince: 150,
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
  commands.listRestorableBackups.mockResolvedValue(restorable);
  commands.previewRestore.mockResolvedValue(cost);
  commands.stageRestore.mockResolvedValue(undefined);
  commands.cancelRestore.mockResolvedValue(undefined);
  // No restore staged, and none was performed by this launch.
  commands.pendingRestore.mockResolvedValue(null);
  commands.restoreOutcome.mockResolvedValue({ status: "nothing" });
  commands.claimRestoreRelock.mockResolvedValue(false);
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
    // Found by its words and then checked for its role: this screen has more
    // than one thing that reports quietly, so "the status" is not a thing.
    expect(await screen.findByText("Back-up gemaakt")).toHaveRole("status");
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

describe("restoring a backup", () => {
  /** Choosing from the picker, which is what asks Rust what it would cost. */
  const choose = async (fileName: string) => {
    const picker = await screen.findByLabelText("Terugzetten vanaf");
    fireEvent.change(picker, { target: { value: fileName } });
  };

  it("offers the backups newest first, by when they were made", async () => {
    renderSettings();
    await loaded();

    const picker = await screen.findByLabelText("Terugzetten vanaf");
    const options = [...picker.querySelectorAll("option")];

    // The empty prompt, then the two backups.
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveValue("timebuddy-20260809T073000Z.db");
    expect(options[2]).toHaveValue("timebuddy-20260803T073000Z.db");
  });

  it("costs nothing to open: no backup is previewed until one is chosen", async () => {
    renderSettings();
    await loaded();

    expect(commands.previewRestore).not.toHaveBeenCalled();
  });

  it("says what would be lost before offering the button that loses it", async () => {
    renderSettings();
    await loaded();

    await choose("timebuddy-20260803T073000Z.db");

    expect(
      await screen.findByText(/3 regels/),
      "the warning is in the words of what goes",
    ).toBeInTheDocument();
    expect(screen.getByText(/2:30 werk/)).toBeInTheDocument();
    expect(commands.previewRestore).toHaveBeenCalledWith(
      "timebuddy-20260803T073000Z.db",
    );
  });

  it("says so plainly when a restore would discard nothing", async () => {
    commands.previewRestore.mockResolvedValue({
      ...cost,
      entriesSince: 0,
      minutesSince: 0,
    });
    renderSettings();
    await loaded();

    await choose("timebuddy-20260803T073000Z.db");

    expect(
      await screen.findByText(/laat niets vervallen/),
    ).toBeInTheDocument();
  });

  it("stages rather than restores, and asks for a restart", async () => {
    // The live database is open, so the swap is the next launch's job. Saying
    // "restored" here would be the one lie this feature cannot tell.
    commands.pendingRestore
      .mockResolvedValueOnce(null)
      .mockResolvedValue("2026-08-03T07:30:00Z");
    renderSettings();
    await loaded();
    await choose("timebuddy-20260803T073000Z.db");
    await screen.findByText(/3 regels/);

    click("Terugzetten voorbereiden");

    await waitFor(() =>
      expect(commands.stageRestore).toHaveBeenCalledWith(
        "timebuddy-20260803T073000Z.db",
      ),
    );
    expect(
      await screen.findByText(/wordt teruggezet zodra TimeBuddy opnieuw start/),
    ).toHaveRole("status");
    // And it says *how* to restart, because closing the window only hides it.
    expect(screen.getByText(/systeemvak/)).toBeInTheDocument();
  });

  it("does not save the settings row on the way", async () => {
    // A restore is not a preference, so it must not ride along with Save.
    renderSettings();
    await loaded();
    await choose("timebuddy-20260803T073000Z.db");
    await screen.findByText(/3 regels/);

    click("Terugzetten voorbereiden");

    await waitFor(() => expect(commands.stageRestore).toHaveBeenCalled());
    expect(commands.updateSettings).not.toHaveBeenCalled();
  });

  it("refuses a damaged backup and says nothing was changed", async () => {
    commands.stageRestore.mockRejectedValue({
      kind: "validation",
      code: "backupUnreadable",
    });
    renderSettings();
    await loaded();
    await choose("timebuddy-20260803T073000Z.db");
    await screen.findByText(/3 regels/);

    click("Terugzetten voorbereiden");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /niet te lezen .* Er is niets gewijzigd\./,
    );
  });

  it("shows the staged restore instead of the picker, with the way out of it", async () => {
    commands.pendingRestore.mockResolvedValue("2026-08-03T07:30:00Z");
    renderSettings();
    await loaded();

    expect(
      await screen.findByText(/Een back-up van .* staat klaar/),
    ).toHaveRole("status");
    expect(
      screen.queryByLabelText("Terugzetten vanaf"),
      "one restore is owed at a time",
    ).not.toBeInTheDocument();

    click("Toch niet terugzetten");
    await waitFor(() => expect(commands.cancelRestore).toHaveBeenCalledTimes(1));
  });

  it("says there is nothing to restore from on a folder with no backups", async () => {
    commands.listRestorableBackups.mockResolvedValue([]);
    renderSettings();
    await loaded();

    expect(
      await screen.findByText("Er zijn nog geen back-ups om terug te zetten."),
    ).toBeInTheDocument();
  });

  it("records a restore that happened, and names the copy it can be undone from", async () => {
    // Read here rather than announced across the app: the restore is explained
    // on the lock screen it caused, and this is where it is looked up after.
    commands.restoreOutcome.mockResolvedValue({
      status: "done",
      restoredFrom: "2026-08-03T07:30:00Z",
      safetyCopy: "timebuddy-20260809T120000Z.db",
    });
    renderSettings();
    await loaded();

    expect(await screen.findByText(/Teruggezet vanaf/)).toBeInTheDocument();
    expect(
      screen.getByText(/timebuddy-20260809T120000Z\.db/),
      "undoing a restore is restoring the copy it made",
    ).toBeInTheDocument();
  });
});
