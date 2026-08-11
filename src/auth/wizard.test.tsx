import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Client, Settings } from "../data/types";

const commands = vi.hoisted(() => ({
  createAccount: vi.fn(),
  createClient: vi.fn(),
  createProject: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => dialog);

const { Wizard } = await import("./wizard");

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

const onDone = vi.fn();

function renderWizard(language: "nl" | "en" = "nl") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n(language)}>
        <Wizard onDone={onDone} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

/** Step one, done properly. */
async function setUpAccount() {
  type("Wachtwoord", "correct horse");
  type("Herstelzin", "blue horse battery staple");
  press("Volgende");
  await screen.findByLabelText("Waar back-ups komen");
}

/** Steps one and two, so a test can start at the third. */
async function reachFirstWork() {
  await setUpAccount();
  press("Volgende");
  await screen.findByLabelText("Je eerste werk");
}

beforeEach(() => {
  vi.clearAllMocks();
  commands.createAccount.mockResolvedValue(undefined);
  commands.createClient.mockResolvedValue(acme);
  commands.createProject.mockResolvedValue(undefined);
  commands.getSettings.mockResolvedValue(settings);
  commands.updateSettings.mockResolvedValue(settings);
  dialog.open.mockResolvedValue(null);
});

describe("the first-run wizard", () => {
  it("opens on the password, and says where in the three it is", () => {
    renderWizard();

    expect(screen.getByText("Stap 1 van 3")).toBeInTheDocument();
    expect(screen.getByLabelText("TimeBuddy vergrendelen")).toBeInTheDocument();
  });

  it("writes the account before moving on", async () => {
    renderWizard();

    await setUpAccount();

    expect(commands.createAccount).toHaveBeenCalledWith(
      "correct horse",
      "blue horse battery staple",
    );
    expect(screen.getByText("Stap 2 van 3")).toBeInTheDocument();
  });

  it("stays on the step Rust refused, and says why", async () => {
    commands.createAccount.mockRejectedValue({
      kind: "validation",
      code: "passwordTooShort",
    });
    renderWizard();

    type("Wachtwoord", "short");
    type("Herstelzin", "blue horse battery staple");
    press("Volgende");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Gebruik minstens 8 tekens.",
    );
    expect(screen.getByText("Stap 1 van 3")).toBeInTheDocument();
  });

  it("hides the password while it is being chosen", () => {
    renderWizard();

    expect(screen.getByLabelText("Wachtwoord")).toHaveAttribute(
      "type",
      "password",
    );
  });
});

describe("choosing where backups go", () => {
  it("defaults to the app's own folder, and says so", async () => {
    renderWizard();
    await setUpAccount();

    expect(screen.getByText("De eigen datamap van de app")).toBeInTheDocument();
  });

  it("records a folder that was picked", async () => {
    dialog.open.mockResolvedValue("C:\\Users\\Rens\\OneDrive\\TimeBuddy");
    renderWizard();
    await setUpAccount();

    press("Map kiezen…");

    expect(
      await screen.findByText("C:\\Users\\Rens\\OneDrive\\TimeBuddy"),
    ).toBeInTheDocument();
  });

  it("takes a cancelled dialog as no answer, not as a choice", async () => {
    renderWizard();
    await setUpAccount();

    press("Map kiezen…");

    await waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(screen.getByText("De eigen datamap van de app")).toBeInTheDocument();
  });

  it("saves the settings row whole, not one column of it", async () => {
    // Settings are edited and saved as a unit (CONTEXT.md).
    dialog.open.mockResolvedValue("C:\\backups");
    renderWizard();
    await setUpAccount();
    press("Map kiezen…");
    await screen.findByText("C:\\backups");

    press("Volgende");

    await waitFor(() =>
      expect(commands.updateSettings).toHaveBeenCalledWith({
        ...settings,
        backupFolder: "C:\\backups",
      }),
    );
  });
});

describe("the first client and project", () => {
  it("creates the project against the client just made", async () => {
    renderWizard();
    await reachFirstWork();

    type("Klant", "Acme");
    type("Project", "Website");
    press("Aan de slag");

    await waitFor(() => expect(commands.createClient).toHaveBeenCalledWith("Acme"));
    await waitFor(() =>
      expect(commands.createProject).toHaveBeenCalledWith(acme.id, "Website"),
    );
  });

  it("lands in the app once there is something to start on", async () => {
    // The point of the wizard: no fresh install ever shows five empty screens.
    renderWizard();
    await reachFirstWork();

    type("Klant", "Acme");
    type("Project", "Website");
    press("Aan de slag");

    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("throws away what the app read before there was anything to read", async () => {
    // The window frame was already asking about settings and a running block
    // while the wizard was still being walked. Opening onto those answers is
    // how a fresh install lands in an app that looks empty.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={createI18n("nl")}>
          <Wizard onDone={onDone} />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    await setUpAccount();
    press("Volgende");
    await screen.findByLabelText("Je eerste werk");

    type("Klant", "Acme");
    type("Project", "Website");
    press("Aan de slag");

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalled();
  });

  it("does not open the app when the work could not be created", async () => {
    commands.createClient.mockRejectedValue({
      kind: "validation",
      code: "nameRequired",
    });
    renderWizard();
    await reachFirstWork();

    press("Aan de slag");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vul een naam in.",
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(commands.createProject).not.toHaveBeenCalled();
  });

  it("renders English when the language is en", async () => {
    renderWizard("en");

    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Lock TimeBuddy")).toBeInTheDocument();
  });
});
