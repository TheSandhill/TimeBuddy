import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { RunningBlock } from "../timer/use-running-block";

/** The window, which in a test is the two things that were asked of it. */
const tauriWindow = vi.hoisted(() => ({
  close: vi.fn(),
  minimize: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriWindow,
}));

const { Titlebar } = await import("./titlebar");

const idle: RunningBlock = { block: null, now: "2026-08-05T12:00:00Z" };

/** A block ten minutes into its twenty-five. */
const inFlight: RunningBlock = {
  block: {
    projectId: 7,
    startAt: "2026-08-05T12:00:00Z",
    plannedMinutes: 25,
  },
  now: "2026-08-05T12:10:00Z",
};

function renderTitlebar(running: RunningBlock = idle) {
  return render(
    <I18nextProvider i18n={createI18n("nl")}>
      <Titlebar {...running} />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tauriWindow.close.mockResolvedValue(undefined);
  tauriWindow.minimize.mockResolvedValue(undefined);
});

describe("the custom titlebar", () => {
  it("carries the wordmark and the two buttons it has", () => {
    renderTitlebar();

    expect(screen.getByText("TimeBuddy")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Minimaliseren" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sluiten" })).toBeInTheDocument();
  });

  it("offers no maximize — that trade is the whole point of ADR-0004", () => {
    renderTitlebar();

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("can be dragged, since nothing native is left to drag it by", () => {
    const { container } = renderTitlebar();

    expect(container.querySelector("header")).toHaveAttribute(
      "data-tauri-drag-region",
    );
  });

  it("minimizes when the small button is pressed", async () => {
    renderTitlebar();

    fireEvent.click(screen.getByRole("button", { name: "Minimaliseren" }));

    await waitFor(() => expect(tauriWindow.minimize).toHaveBeenCalled());
  });

  it("asks to close and leaves the rest to Rust", async () => {
    // Whether a close hides in the tray is decided in one place, and it is not
    // here — otherwise this button and Alt+F4 would mean different things.
    renderTitlebar();

    fireEvent.click(screen.getByRole("button", { name: "Sluiten" }));

    await waitFor(() => expect(tauriWindow.close).toHaveBeenCalled());
  });
});

describe("the timer pill", () => {
  it("shows what is left of a running block, on every screen", () => {
    renderTitlebar(inFlight);

    expect(screen.getByRole("timer")).toHaveTextContent("15:00");
  });

  it("is absent rather than empty when nothing is running", () => {
    renderTitlebar();

    expect(screen.queryByRole("timer")).toBeNull();
  });
});
