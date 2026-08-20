import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18n } from "../i18n/config";
import { stylesheet, tokenPx } from "../test/stylesheet";
import { PomodoroDial } from "./pomodoro-dial";

/**
 * The dial is the screen (`CONTEXT.md`, Pomodoro Block): the ring and the digits
 * own the top and everything else is visibly secondary. These tests are about
 * what the ring *says* — the arc, and the two ways a block can be alive — rather
 * than about how a block is started, which `routes/timer.test.tsx` owns.
 */
function showDial(props: Partial<Parameters<typeof PomodoroDial>[0]> = {}) {
  return render(
    <I18nextProvider i18n={createI18n("nl")}>
      <PomodoroDial
        countdown="25:00"
        remaining={1}
        running={false}
        paused={false}
        canStart
        onStart={() => {}}
        onPause={() => {}}
        onResume={() => {}}
        onStop={() => {}}
        {...props}
      />
    </I18nextProvider>,
  );
}

/**
 * The mark is held against the **ring**, not against the digits.
 *
 * `CONTEXT.md` → Mug makes the digits dominant by weight rather than by size, so
 * the mark being the wider of the two is not a violation and there is no ratio
 * left to assert. What is still checkable — and what actually breaks the screen
 * if it goes wrong — is containment: the digits and the mark share the inside of
 * the ring, and neither may push the other out of it.
 *
 * The digits' size is read from the token rather than restated, because it has
 * already been retuned once (66 -> 60) and a copy here would have gone stale
 * without failing.
 */
const digitPx = () => tokenPx("--text-dial");
const RING_INNER_DIAMETER = 2 * (106 - 9 / 2);

const markOf = (container: HTMLElement) =>
  container.querySelector("[data-app-mark]") as HTMLImageElement;

/** The arc that carries progress, as opposed to the track behind it. */
const arcOf = (container: HTMLElement) =>
  container.querySelector("circle + circle") as SVGCircleElement;

const drawn = (arc: SVGCircleElement) =>
  Number(arc.getAttribute("stroke-dasharray")) -
  Number(arc.getAttribute("stroke-dashoffset"));

describe("the dial", () => {
  it("makes the digits the largest thing on the screen", () => {
    showDial();

    // The one size in the theme contract, and nothing else comes near it.
    expect(screen.getByText("25:00")).toHaveClass("text-dial");
  });

  it("puts the Mug under the digits, inside the ring with them", () => {
    // The mark is the app's face and the same mug as the app icon (ADR-0016).
    // Its size is the owner's to tune; what a test can hold it to is that the
    // digits and the mark still fit in the circle they share.
    const { container } = showDial({ running: true });

    const mark = markOf(container);
    expect(mark.tagName).toBe("IMG");
    expect(mark.getAttribute("src")).toMatch(/mug/i);

    const stacked = digitPx() + Number(mark.getAttribute("height"));
    expect(stacked).toBeLessThan(RING_INNER_DIAMETER);
  });

  it("says nothing with the mark, so the digits are never read twice", () => {
    // Decorative, like every glyph in the set (ADR-0014): the countdown and the
    // word *paused* are what a screen reader gets.
    const { container } = showDial({ running: true });

    expect(markOf(container)).toHaveAttribute("alt", "");
    expect(markOf(container)).toHaveAttribute("aria-hidden", "true");
  });

  it("drops the mark in High-contrast rather than recolouring it", () => {
    // A raster cannot flatten to an outline, and a soft shaded object in the
    // theme that promises nothing is soft would honour no token at all. The
    // cascade answers this, not a branch in the component (ADR-0004).
    expect(stylesheet).toMatch(
      /\[data-theme="high-contrast"\][^{]*\[data-app-mark\][^{]*\{[^}]*display:\s*none/,
    );
  });

  it("draws no arc at all while nothing is running", () => {
    // An idle dial shows the length it would run, not a full ring of progress.
    const { container } = showDial();

    expect(drawn(arcOf(container))).toBeCloseTo(0);
  });

  it("empties the arc as the block runs out", () => {
    const { container } = showDial({ running: true, remaining: 0.25 });
    const arc = arcOf(container);

    expect(drawn(arc)).toBeCloseTo(
      Number(arc.getAttribute("stroke-dasharray")) * 0.25,
    );
  });

  it("breathes while the block runs, in the accent", () => {
    const { container } = showDial({ running: true, remaining: 0.5 });

    expect(container.querySelector("svg")).toHaveClass("animate-breath");
    expect(arcOf(container)).toHaveClass("stroke-accent");
  });

  it("goes flat and muted the moment the block is held", () => {
    // Three signals now (`CONTEXT.md`, Mug): the word says held, the ring stops
    // breathing rather than merely changing colour, and the Mug dims. The mark
    // is the signal the spare was owed to.
    const { container } = showDial({
      running: true,
      paused: true,
      remaining: 0.5,
    });

    expect(screen.getByText("Gepauzeerd")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toHaveClass("animate-breath");
    expect(arcOf(container)).toHaveClass("stroke-ink-muted");
    expect(markOf(container)).toHaveClass("opacity-40");
  });

  it("says held with a level and never with a loop", () => {
    // The reason it is opacity (ADR-0004): reduced motion and High-contrast both
    // set every loop to `none`, so a state that only moved would vanish. The
    // running mark states its level rather than leaving it to the cascade, and
    // it carries no animation at all — the ring is where this screen breathes.
    const { container } = showDial({ running: true, remaining: 0.5 });
    const mark = markOf(container);

    expect(mark).toHaveClass("opacity-100");
    expect(mark.className).not.toMatch(/animate-/);
  });

  it("offers the obvious next thing as the big button, Stop beside it", () => {
    showDial({ running: true, remaining: 0.5 });

    expect(screen.getByRole("button", { name: "Pauzeer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });
});
