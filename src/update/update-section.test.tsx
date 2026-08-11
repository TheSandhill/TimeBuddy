import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";

const updater = vi.hoisted(() => ({
  currentVersion: vi.fn(),
  checkForUpdate: vi.fn(),
}));
vi.mock("./updater", () => updater);

const { UpdateSection } = await import("./update-section");

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapped = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={createI18n("nl")}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
  render(<UpdateSection />, { wrapper: wrapped });
}

beforeEach(() => {
  vi.clearAllMocks();
  updater.currentVersion.mockResolvedValue("0.1.0");
  updater.checkForUpdate.mockResolvedValue(null);
});

describe("the updates section", () => {
  it("says which version this is", async () => {
    renderSection();

    expect(await screen.findByText(/versie 0\.1\.0/i)).toBeInTheDocument();
  });

  it("says this is the newest when the check says so", async () => {
    renderSection();

    expect(await screen.findByText("Dit is de nieuwste versie.")).toBeVisible();
  });

  it("names the newer version when there is one", async () => {
    updater.checkForUpdate.mockResolvedValue({
      version: "0.2.0",
      install: vi.fn(),
    });

    renderSection();

    expect(
      await screen.findByText("TimeBuddy 0.2.0 is beschikbaar."),
    ).toBeVisible();
  });

  it("is the one place a check that could not be made is admitted", async () => {
    // The bar across the top stays quiet about this on purpose. Here it is read
    // rather than announced — the same split as a stale backup folder.
    updater.checkForUpdate.mockRejectedValue(new Error("no network"));

    renderSection();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /kon GitHub niet bereiken/,
    );
  });

  it("asks again when the button is pressed", async () => {
    renderSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Controleer op updates" }),
    );

    await waitFor(() => expect(updater.checkForUpdate).toHaveBeenCalledTimes(2));
  });

  it("does not offer to install — that lives on the bar, so there is one download", async () => {
    updater.checkForUpdate.mockResolvedValue({
      version: "0.2.0",
      install: vi.fn(),
    });

    renderSection();
    await screen.findByText("TimeBuddy 0.2.0 is beschikbaar.");

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("warns about the unknown-publisher prompt before it happens", async () => {
    // TimeBuddy is unsigned (ADR-0009). A Windows warning nobody was told to
    // expect is one that gets answered with "no".
    renderSection();

    expect(
      await screen.findByText(/onbekende uitgever/i),
    ).toBeInTheDocument();
  });
});
