import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Icon,
  ICON_NAMES,
  RunningIndicator,
  Spinner,
  type IconName,
} from "./icon";

const glyphOf = (name: IconName) => {
  const { container } = render(<Icon name={name} />);
  const svg = container.querySelector("svg");
  if (svg === null) throw new Error(`${name} rendered no glyph`);
  return svg;
};

describe("the icon set", () => {
  it("has icons to guard", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
  });

  it("hides every glyph from the accessibility tree", () => {
    // The control carries the name. A glyph that spoke would give it two.
    for (const name of ICON_NAMES) {
      expect(glyphOf(name), name).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("draws every glyph in the colour it inherits", () => {
    for (const name of ICON_NAMES) {
      expect(glyphOf(name), name).toHaveAttribute("fill", "currentColor");
    }
  });

  it("fills rather than strokes, so a glyph scales without thickening", () => {
    for (const name of ICON_NAMES) {
      const svg = glyphOf(name);
      expect(svg.getAttribute("stroke"), name).toBeNull();
      expect(svg.getAttribute("stroke-width"), name).toBeNull();
    }
  });

  it("draws every glyph on the one grid", () => {
    // Bold Phosphor's 24-unit stroke only lands at the app's weight on its own
    // 256 grid. A glyph pasted in at another viewBox would arrive lighter.
    for (const name of ICON_NAMES) {
      expect(glyphOf(name), name).toHaveAttribute("viewBox", "0 0 256 256");
    }
  });

  it("sizes by class, and defaults to the tab bar's size", () => {
    expect(glyphOf("timer")).toHaveClass("size-4");
    const { container } = render(<Icon name="timer" className="size-5" />);
    expect(container.querySelector("svg")).toHaveClass("size-5");
  });

  it("draws every glyph as at least one path", () => {
    for (const name of ICON_NAMES) {
      expect(glyphOf(name).querySelectorAll("path").length, name).toBeGreaterThan(
        0,
      );
    }
  });

  it("assembles the warning, and draws it at the set's own weight", () => {
    // The set ships no triangle-with-exclamation, so this one is composed. The
    // exclamation is authored at final size rather than scaled: a `transform`
    // here would mean someone shrank a bigger glyph, which thins its stroke and
    // leaves the triangle and its exclamation reading as two weights.
    const paths = glyphOf("warning").querySelectorAll("path");
    expect(paths.length).toBe(2);
    for (const path of paths) {
      expect(path.getAttribute("transform")).toBeNull();
    }
  });

  it("keeps the two that move out of the record", () => {
    // They are a loop rather than a shape, and on another grid. Letting them in
    // would cost every guard above its "every glyph" phrasing.
    expect(ICON_NAMES).not.toContain("spinner");
    expect(ICON_NAMES).not.toContain("running");
  });

  it("names no colour of its own", () => {
    // ADR-0004's rule holds for artwork too: no icon opts out of the theme.
    const source = readFileSync("src/components/icon.tsx", "utf8");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("the glyphs that move", () => {
  const svgOf = (ui: React.ReactElement) => {
    const { container } = render(ui);
    const svg = container.querySelector("svg");
    if (svg === null) throw new Error("rendered no glyph");
    return svg;
  };

  it("drives both loops from the theme, never from SMIL", () => {
    // The whole reason these were rebuilt: a SMIL `<animate>` does not read
    // CSS, so it would keep moving through High-contrast's `--animate-*: none`
    // and through `prefers-reduced-motion` alike (ADR-0014).
    for (const ui of [<Spinner />, <RunningIndicator />]) {
      const svg = svgOf(ui);
      expect(svg.querySelector("animate")).toBeNull();
      expect(svg.querySelector("animateTransform")).toBeNull();
    }
  });

  it("names a themed animation rather than a duration", () => {
    expect(svgOf(<Spinner />)).toHaveClass("animate-spin");
    expect(
      svgOf(<RunningIndicator />).querySelector(".animate-pulse-ring"),
    ).not.toBeNull();
  });

  it("leaves something visible when the loop is turned off", () => {
    // High-contrast sets both to `none`. A spinner is still a ring, and a
    // running block still has its dot: motion is the pleasure, not the message.
    expect(svgOf(<Spinner />).querySelectorAll("path").length).toBe(2);

    const still = svgOf(<RunningIndicator />).querySelector("circle");
    expect(still).not.toBeNull();
    expect(still).not.toHaveClass("animate-pulse-ring");
    expect(still).toHaveAttribute("r", "4");
  });

  it("hides both from the accessibility tree, like every other glyph", () => {
    expect(svgOf(<Spinner />)).toHaveAttribute("aria-hidden", "true");
    expect(svgOf(<RunningIndicator />)).toHaveAttribute("aria-hidden", "true");
  });

  it("sizes by class", () => {
    expect(svgOf(<Spinner className="size-5" />)).toHaveClass("size-5");
    expect(svgOf(<RunningIndicator className="size-3" />)).toHaveClass("size-3");
  });
});
