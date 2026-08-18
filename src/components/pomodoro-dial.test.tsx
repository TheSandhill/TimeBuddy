import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18n } from "../i18n/config";
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

  it("keeps the centre's mark slot empty rather than filling it", () => {
    // The Mug is deferred (ADR-0004), and a placeholder glyph would be a second
    // thing competing with the digits.
    const { container } = showDial({ running: true });

    const mark = container.querySelector("[data-dial-mark]");
    expect(mark).not.toBeNull();
    expect(mark).toBeEmptyDOMElement();
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
    // Two signals and no spare (`CONTEXT.md`, Mug): the word says held, and the
    // ring stops breathing rather than merely changing colour.
    const { container } = showDial({
      running: true,
      paused: true,
      remaining: 0.5,
    });

    expect(screen.getByText("Gepauzeerd")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toHaveClass("animate-breath");
    expect(arcOf(container)).toHaveClass("stroke-ink-muted");
  });

  it("offers the obvious next thing as the big button, Stop beside it", () => {
    showDial({ running: true, remaining: 0.5 });

    expect(screen.getByRole("button", { name: "Pauzeer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });
});
