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

const steamOf = (container: HTMLElement) =>
  container.querySelector(".mug-steam") as SVGElement;

const digitsOf = (container: HTMLElement) =>
  container.querySelector("p.text-dial") as HTMLElement;

/** The held overlay, which is always mounted and says so by attribute. */
const heldOf = ({ container }: { container: HTMLElement }) =>
  container.querySelector("[data-held]") as HTMLElement;

/** Its two layers: the circle-wide dimming, and the glyph above it. */
const heldScrimOf = (container: HTMLElement) =>
  container.querySelector("[data-held] > div") as HTMLElement;

const heldGlyphOf = (container: HTMLElement) =>
  container.querySelector("[data-held] > svg") as SVGElement;

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
    // The ring stops breathing rather than merely changing colour, and the Mug
    // greys out — dimmed and desaturated, so its warmth goes with it.
    const { container } = showDial({
      running: true,
      paused: true,
      remaining: 0.5,
    });

    expect(container.querySelector("svg")).not.toHaveClass("animate-breath");
    expect(arcOf(container)).toHaveClass("stroke-ink-muted");
    expect(markOf(container)).toHaveClass("opacity-40", "grayscale");
  });

  it("drains the digits rather than hiding them when held", () => {
    // What is on the clock is still the truth; it has just stopped being spent.
    // Scoped per render rather than through `screen`, because two dials in one
    // document would make "25:00" ambiguous.
    expect(digitsOf(showDial({ running: true }).container)).toHaveClass(
      "text-ink",
    );
    expect(
      digitsOf(showDial({ running: true, paused: true }).container),
    ).toHaveClass("text-ink-muted");
  });

  it("projects the pause glyph over the dial when held, and only then", () => {
    // Over, not among: it carries `z-20` because the digits already carry z-10
    // for the steam, and this is the one thing allowed above them.
    expect(heldOf(showDial())).toHaveAttribute("data-held", "off");

    const held = heldOf(showDial({ running: true, paused: true }));
    expect(held).toHaveAttribute("data-held", "on");
    expect(held).toHaveClass("z-20");
    expect(held.querySelector("svg")).not.toBeNull();
  });

  it("animates both layers in and out rather than snapping them on", () => {
    // Mounted always and toggled, so both directions have something to move
    // from — the same reason the steam layer is never mounted into its on state.
    //
    // Two tiers, because they are two gestures: the glyph overshoots, which is
    // what `bounce` is for, and the scrim is a dimming, which is a disclosure.
    // Tiers rather than numbers, so reduced motion collapses both with no branch
    // in the component.
    const held = showDial({ running: true, paused: true }).container;

    expect(heldGlyphOf(held)).toHaveClass(
      "motion-bounce",
      "ease-bounce-soft",
      "scale-100",
      "opacity-100",
    );
    expect(heldScrimOf(held)).toHaveClass("motion-base", "opacity-100");

    const idle = showDial().container;
    expect(heldGlyphOf(idle)).toHaveClass("scale-75", "opacity-0");
    expect(heldScrimOf(idle)).toHaveClass("opacity-0");
  });

  it("dims only the circle's inside, so the ring stays readable", () => {
    // The ring is the one thing that says *how much is left*, and that stays
    // true while a block is held. The scrim stops at the track: `rounded-full`
    // at exactly the ring's inner diameter.
    const scrim = heldScrimOf(showDial({ running: true, paused: true }).container);

    expect(scrim).toHaveClass("rounded-full");
    // Pulled towards the theme's own surface rather than washed with black, so
    // it dims correctly on a dark theme and a light one without a branch.
    expect(scrim.className).toMatch(/bg-surface\//);
    expect(scrim.style.width).toBe(`${2 * (106 - 9 / 2)}px`);
  });

  it("still says the word out loud, since a glyph cannot speak", () => {
    // ADR-0014: the icon set is `aria-hidden` with no way to pass a label, so
    // replacing the visible word with a glyph would have left a held block
    // announcing nothing. The titlebar's pill is `role="timer"` on purpose and
    // never announces either.
    showDial({ running: true, paused: true });

    const status = screen.getByText("Gepauzeerd");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveClass("sr-only");
  });

  it("steams only while a block is actually running", () => {
    // Pleasure, not signal: *running* is the moving digits and the breathing
    // ring. The steam follows the ring — a held cup that went on steaming would
    // be the same disagreement as a ring breathing over a stopped countdown.
    expect(steamOf(showDial().container)).toHaveAttribute(
      "data-steaming",
      "off",
    );
    expect(
      steamOf(showDial({ running: true, remaining: 0.5 }).container),
    ).toHaveAttribute("data-steaming", "on");
    expect(
      steamOf(
        showDial({ running: true, paused: true, remaining: 0.5 }).container,
      ),
    ).toHaveAttribute("data-steaming", "off");
  });

  it("mounts the steam before Start, so it has something to fade from", () => {
    // The prototype's recorded bug, in its other form: a panel rebuilt
    // already-open has no `0fr` to spring from. A steam layer that arrived the
    // moment Start was pressed would snap on for exactly the same reason, so an
    // idle dial carries the layer already — faded out, not absent.
    expect(steamOf(showDial().container)).not.toBeNull();
  });

  it("fades the steam on the tier written for a manual stop", () => {
    // `deliberate` is "the one animation allowed to be slow enough to notice,
    // the Mug pouring out when a block is stopped by hand". The pour-out went
    // with the drawing; this is its heir, so the tier is spent rather than left
    // waiting for a mug that cannot drain.
    expect(stylesheet).toMatch(
      /\.mug-steam\s*\{[^}]*transition:[^;]*var\(--motion-deliberate\)/,
    );

    // Hidden costs nothing: the turbulence would otherwise repaint behind a
    // transparent layer on an idle screen.
    expect(stylesheet).toMatch(/\.mug-steam\s*\{[^}]*visibility:\s*hidden/);
  });

  it("drops the steam with the mug in High-contrast, not on its own", () => {
    // The mug and its steam are siblings, so a rule naming only the image would
    // leave the plumes rising out of nothing.
    expect(stylesheet).toMatch(
      /\[data-theme="high-contrast"\][^{]*\.mug-steam[^{]*\{[^}]*display:\s*none/,
    );
  });

  it("removes the steam under reduced motion rather than freezing it", () => {
    // The one loop with no still form worth having: three blurred plumes caught
    // mid-rise are a smudge above the cup, not calm. Safe to drop for the reason
    // ADR-0004 demands — the steam never carried *running*.
    expect(stylesheet).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?\.mug-steam\s*\{[^}]*display:\s*none/,
    );
  });

  it("drives the steam from CSS so a theme can turn it off", () => {
    // SMIL does not read CSS (ADR-0014), so an `<animate>` element here would
    // ignore both `--animate-steam: none` and the OS's reduced-motion setting.
    const steam = steamOf(
      showDial({ running: true, remaining: 0.5 }).container,
    );

    expect(
      steam.querySelector("animate, animateTransform, animateMotion"),
    ).toBeNull();
    // A floor rather than a count: the number is a look to tune, but one or two
    // plumes is the particle read this is built to avoid, whatever else changes.
    expect(
      steam.querySelectorAll(".mug-steam__plume").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps the digits in front of the steam that rises past them", () => {
    // Painting order would put the mark's steam over the digits, because the
    // mark comes later in the tree. The digits are what this screen is about.
    showDial({ running: true, remaining: 0.5 });

    expect(screen.getByText("25:00")).toHaveClass("relative", "z-10");
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
