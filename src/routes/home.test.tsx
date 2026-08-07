import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../i18n/config";
import { Home } from "./home";

function renderWithLanguage(language: "nl" | "en") {
  const i18n = createI18n(language);
  return render(
    <I18nextProvider i18n={i18n}>
      <Home />
    </I18nextProvider>,
  );
}

describe("Home route", () => {
  it("renders the Dutch app name and tagline by default", () => {
    renderWithLanguage("nl");
    expect(
      screen.getByRole("heading", { name: "TimeBuddy" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nog geen uren geregistreerd.")).toBeInTheDocument();
  });

  it("renders English when the language is en", () => {
    renderWithLanguage("en");
    expect(screen.getByText("No hours logged yet.")).toBeInTheDocument();
  });
});
