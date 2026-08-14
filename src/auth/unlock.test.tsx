import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";

const commands = vi.hoisted(() => ({
  unlockAccount: vi.fn(),
  resetAccountPassword: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const { Unlock } = await import("./unlock");

const onOpen = vi.fn();

function renderUnlock(language: "nl" | "en" = "nl") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n(language)}>
        <Unlock onOpen={onOpen} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  commands.unlockAccount.mockResolvedValue(null);
  commands.resetAccountPassword.mockResolvedValue(undefined);
});

describe("the lock screen", () => {
  it("opens on the right password", async () => {
    renderUnlock();

    type("Wachtwoord", "correct horse");
    press("Ontgrendelen");

    await waitFor(() =>
      expect(commands.unlockAccount).toHaveBeenCalledWith(
        "correct horse",
        false,
      ),
    );
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(null));
  });

  it("passes the token on when remembering was asked for", async () => {
    commands.unlockAccount.mockResolvedValue("a-token");
    renderUnlock();

    type("Wachtwoord", "correct horse");
    fireEvent.click(screen.getByLabelText("Onthoud mij 30 dagen"));
    press("Ontgrendelen");

    await waitFor(() =>
      expect(commands.unlockAccount).toHaveBeenCalledWith(
        "correct horse",
        true,
      ),
    );
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("a-token"));
  });

  it("says what was wrong, and stays shut", async () => {
    commands.unlockAccount.mockRejectedValue({
      kind: "validation",
      code: "wrongPassword",
    });
    renderUnlock();

    type("Wachtwoord", "not it");
    press("Ontgrendelen");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dat wachtwoord klopt niet.",
    );
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("never puts the password anywhere it could be read off the screen", () => {
    renderUnlock();

    expect(screen.getByLabelText("Wachtwoord")).toHaveAttribute(
      "type",
      "password",
    );
  });
});

describe("a forgotten password", () => {
  const startRecovering = () => press("Wachtwoord vergeten?");

  it("is recoverable with the phrase alone — no email, no reset link", async () => {
    renderUnlock();
    startRecovering();

    type("Herstelzin", "blue horse battery staple");
    type("Nieuw wachtwoord", "a whole new one");
    press("Wachtwoord instellen");

    await waitFor(() =>
      expect(commands.resetAccountPassword).toHaveBeenCalledWith(
        "blue horse battery staple",
        "a whole new one",
      ),
    );
  });

  it("hands back to the lock screen and says the password changed", async () => {
    // Not straight through the door: "your password has been changed" must
    // not be something the user infers from an error about something else.
    renderUnlock();
    startRecovering();

    type("Herstelzin", "blue horse battery staple");
    type("Nieuw wachtwoord", "a whole new one");
    press("Wachtwoord instellen");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Je wachtwoord is gewijzigd.",
    );
    expect(screen.getByLabelText("Wachtwoord")).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    expect(commands.unlockAccount).not.toHaveBeenCalled();
  });

  it("masks the phrase where it is typed back in", () => {
    // The wizard shows it to be written down; here it is a reset credential
    // on the shared laptop ADR-0003 is about.
    renderUnlock();
    startRecovering();

    expect(screen.getByLabelText("Herstelzin")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("keeps neither secret in a field after it is spent", async () => {
    renderUnlock();
    startRecovering();
    type("Herstelzin", "blue horse battery staple");
    type("Nieuw wachtwoord", "a whole new one");
    press("Wachtwoord instellen");
    await screen.findByRole("status");

    startRecovering();

    expect(screen.getByLabelText("Herstelzin")).toHaveValue("");
    expect(screen.getByLabelText("Nieuw wachtwoord")).toHaveValue("");
  });

  it("says so when the phrase is not the one", async () => {
    commands.resetAccountPassword.mockRejectedValue({
      kind: "validation",
      code: "wrongRecoveryPhrase",
    });
    renderUnlock();
    startRecovering();

    type("Herstelzin", "green horse battery staple");
    type("Nieuw wachtwoord", "a whole new one");
    press("Wachtwoord instellen");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die herstelzin klopt niet.",
    );
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("can be backed out of", () => {
    renderUnlock();
    startRecovering();

    press("Terug");

    expect(screen.getByLabelText("Wachtwoord")).toBeInTheDocument();
    expect(screen.queryByLabelText("Herstelzin")).toBeNull();
  });

  it("renders English when the language is en", () => {
    renderUnlock("en");

    expect(
      screen.getByRole("button", { name: "Forgotten your password?" }),
    ).toBeInTheDocument();
  });
});
