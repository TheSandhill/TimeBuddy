import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES, type IconName } from "./icon";

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

  it("names no colour of its own", () => {
    // ADR-0004's rule holds for artwork too: no icon opts out of the theme.
    const source = readFileSync("src/components/icon.tsx", "utf8");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
