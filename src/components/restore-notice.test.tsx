import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18n, type Language } from "../i18n/config";
import { RestoreNotice } from "./restore-notice";

const show = (language: Language) =>
  render(
    <I18nextProvider i18n={createI18n(language)}>
      <RestoreNotice restoredFrom="2026-08-03T07:30:00Z" />
    </I18nextProvider>,
  );

describe("explaining the lock screen after a restore", () => {
  it("says which backup the app came back from", () => {
    show("nl");

    expect(screen.getByRole("status")).toHaveTextContent(/teruggezet vanaf/i);
  });

  it("says the password is the one from that day", () => {
    // The account row travels with the database, so the re-lock is correct and
    // completely baffling unless it is explained here.
    show("nl");

    expect(screen.getByRole("status")).toHaveTextContent(
      /het wachtwoord dat je die dag gebruikte/,
    );
  });

  it("reads the stamp in the reader's own timezone and language", () => {
    // Stored UTC, converted at the edge — a bare UTC stamp is not an answer to
    // "which day was this".
    show("en");

    const said = screen.getByRole("status").textContent ?? "";
    expect(said).not.toContain("2026-08-03T07:30:00Z");
    expect(said).toMatch(/Aug/);
  });
});
