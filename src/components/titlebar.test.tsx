import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { RunningBlock } from "../timer/lifecycle";

/** The window, which in a test is the two things that were asked of it. */
const tauriWindow = vi.hoisted(() => ({
  close: vi.fn(),
  minimize: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriWindow,
}));

const { Titlebar } = await import("./titlebar");

/** The bar's own height (`h-10`), which is the mark's only ceiling here. */
const BAR_PX = 40;

const idle: RunningBlock = { block: null, now: "2026-08-05T12:00:00Z" };

/** A block ten minutes into its twenty-five. */
const inFlight: RunningBlock = {
  block: {
    projectId: 7,
    startAt: "2026-08-05T12:00:00Z",
    plannedMinutes: 25,
    pausedAt: null,
    pausedSeconds: 0,
  },
  now: "2026-08-05T12:10:00Z",
};

/** The same block, held at the ten-minute mark and five minutes ago. */
const held: RunningBlock = {
  block: { ...inFlight.block!, pausedAt: "2026-08-05T12:10:00Z" },
  now: "2026-08-05T12:15:00Z",
};

/**
 * Whether Tauri would start a window drag from a mousedown on `element`.
 *
 * A transcription of the rule in `tauri/src/window/scripts/drag.js`, which the
 * webview injects and jsdom therefore never sees. The rule is worth restating
 * because it is not the one it looks like: a bare `data-tauri-drag-region` is
 * **self only** — it does not reach the element's own children — so a bar built
 * out of nested divs is full of holes unless the attribute says `deep`.
 * Clickable elements stop the walk before any ancestor is consulted, which is
 * what keeps the window buttons clickable inside a deep region.
 */
function wouldDrag(element: HTMLElement, root: HTMLElement): boolean {
  const clickable = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
  const interactiveRoles = new Set(["button", "link", "menuitem", "tab"]);

  for (
    let current: HTMLElement | null = element;
    current !== null;
    current = current === root ? null : current.parentElement
  ) {
    const attr = current.getAttribute("data-tauri-drag-region");
    const isClickable =
      clickable.has(current.tagName) ||
      interactiveRoles.has(current.getAttribute("role") ?? "");

    if (isClickable && attr === null) return false;
    if (attr === null) continue;
    if (attr === "false") return false;
    if (attr === "deep") return true;
    if (attr === "" || attr === "true") return current === element;
  }

  return false;
}

function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  return role === null ? tag : `${tag}[role=${role}]`;
}

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

  it("puts the Mug beside the wordmark, small enough for a 40px bar", () => {
    // The left cell was the wordmark alone while the Mug was deferred; ADR-0016
    // fills it with the same mark the dial carries.
    const { container } = renderTitlebar();

    const mark = container.querySelector("[data-app-mark]") as HTMLImageElement;
    expect(mark.getAttribute("src")).toMatch(/mug/i);
    expect(Number(mark.getAttribute("height"))).toBeLessThan(BAR_PX);
  });

  it("never dims the Mug in the bar, whatever the block is doing", () => {
    // Held is the pill's to say here. The bar is on every screen, which makes it
    // the wrong place to repeat a thing the dial already says three ways.
    const { container } = renderTitlebar(held);

    expect(container.querySelector("[data-app-mark]")).not.toHaveClass(
      "opacity-40",
    );
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

  it("leaves no dead spot: every part of the bar but the buttons drags", () => {
    const { container } = renderTitlebar(inFlight);
    const header = container.querySelector("header") as HTMLElement;

    // The buttons are the deliberate exception, and have their own test.
    for (const element of [header, ...header.querySelectorAll("*")]) {
      if (element.closest("button") !== null) {
        continue;
      }
      expect(
        wouldDrag(element as HTMLElement, header),
        `${describeElement(element)} is a dead spot on the titlebar`,
      ).toBe(true);
    }
  });

  it("still lets the buttons be clicked rather than dragged", () => {
    const { container } = renderTitlebar(inFlight);
    const header = container.querySelector("header") as HTMLElement;

    for (const button of header.querySelectorAll("button")) {
      expect(wouldDrag(button, header), describeElement(button)).toBe(false);
    }
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

  it("says a held block is held, so a stopped countdown is not a crash", () => {
    renderTitlebar(held);

    // Frozen where it was held, and the word carries the state — the pill is
    // read on every screen, so it cannot rely on the dial's muted ring.
    expect(screen.getByRole("timer")).toHaveTextContent("15:00 — gepauzeerd");
  });
});
