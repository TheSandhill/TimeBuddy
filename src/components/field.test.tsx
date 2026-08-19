import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { componentSources, lineOf, parse, srcDir } from "../test/class-lists";
import { checkboxClass, radioClass } from "./field";
import { Icon } from "./icon";

const stylesheet = readFileSync(path.join(srcDir, "styles.css"), "utf8");

/**
 * The body of the first rule whose selector list is written exactly like this.
 *
 * The lookbehind is what keeps `.radio-dot::after` from finding the shared
 * `.checkbox-box::after, .radio-dot::after` above it: a selector continuing a
 * list is preceded by a comma, and a selector list opening a rule is not.
 */
const ruleFor = (selectors: string): string => {
  const escaped = selectors.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const [, body] =
    stylesheet.match(
      new RegExp(`(?:^|(?<!,)\\n)${escaped}\\s*\\{([^}]*)\\}`),
    ) ?? [];
  expect(body, `no rule for \`${selectors}\``).toBeDefined();
  return body ?? "";
};

/**
 * The classes that mean "this control is drawn by the app". The switch is one of
 * them: it is a checkbox too, and it was drawn first — the Clients filter.
 */
const drawnControls = new Set(["checkboxClass", "radioClass", "switch-track"]);

/**
 * A tick-or-dot input left bare renders as an OS control: square, hard-edged and
 * in the Windows accent blue, whatever the theme says (#74). The look lives in
 * one place, so what a screen has to do is name it.
 */
function findBareControls(fileName: string, source: string): string[] {
  const file = parse(fileName, source);
  const offenders: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(file);
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const valueOf = (name: string) =>
        attributes.find((attribute) => attribute.name.getText(file) === name)
          ?.initializer;

      const type = valueOf("type");
      const isToggle =
        tag === "input" &&
        type !== undefined &&
        ts.isStringLiteral(type) &&
        (type.text === "checkbox" || type.text === "radio");

      if (isToggle && ts.isStringLiteral(type)) {
        const className = valueOf("className");
        const named =
          className !== undefined &&
          (ts.isStringLiteral(className)
            ? drawnControls.has(className.text)
            : ts.isJsxExpression(className) &&
              className.expression !== undefined &&
              ts.isIdentifier(className.expression) &&
              drawnControls.has(className.expression.text));

        if (!named) {
          offenders.push(
            `${fileName}:${lineOf(file, node)}: a bare ${type.text}: the app draws its own`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return offenders;
}

describe("the drawn-control guard", () => {
  const reasons = (source: string) =>
    findBareControls("routes/fixture.tsx", source).map((offence) =>
      offence.slice(offence.indexOf(": ") + 2),
    );

  it("fails a checkbox and a radio wearing nothing", () => {
    expect(
      reasons(`const a = <input type="checkbox" checked={x} />;`),
    ).toEqual(["a bare checkbox: the app draws its own"]);
    expect(reasons(`const a = <input type="radio" name="theme" />;`)).toEqual([
      "a bare radio: the app draws its own",
    ]);
  });

  it("fails one dressed in something that is not the vocabulary", () => {
    expect(
      reasons(`const a = <input type="checkbox" className="size-4" />;`),
    ).toEqual(["a bare checkbox: the app draws its own"]);
  });

  it("passes the three drawn controls", () => {
    expect(
      reasons(`const a = <input type="checkbox" className={checkboxClass} />;`),
    ).toEqual([]);
    expect(
      reasons(`const a = <input type="radio" className={radioClass} />;`),
    ).toEqual([]);
    expect(
      reasons(`const a = <input type="checkbox" className="switch-track" />;`),
    ).toEqual([]);
  });

  it("leaves the inputs that were never blue alone", () => {
    expect(reasons(`const a = <input type="password" />;`)).toEqual([]);
    expect(reasons(`const a = <input type="number" min={1} />;`)).toEqual([]);
  });

  it("finds no bare checkbox or radio in component source", () => {
    const sources = componentSources();
    expect(sources.length, "guard scanned no files").toBeGreaterThan(0);

    expect(
      sources.flatMap(({ fileName, source }) =>
        findBareControls(fileName, source),
      ),
    ).toEqual([]);
  });
});

describe("the checkbox and the radio, drawn", () => {
  const base = ruleFor(".checkbox-box,\n.radio-dot");
  const checked = ruleFor(".checkbox-box:checked,\n.radio-dot:checked");
  const mark = ruleFor(".checkbox-box::after,\n.radio-dot::after");

  it("stops being a UA control at all", () => {
    expect(base).toMatch(/appearance:\s*none;/);
  });

  it("fills with the accent when checked, so a theme swap recolours it", () => {
    expect(checked).toMatch(/background-color:\s*var\(--color-accent\);/);
  });

  it("marks the checked state in an ink that clears AA on the accent", () => {
    // The pairing `contrast.test.ts` already gates for the dropdown highlight.
    expect(mark).toMatch(/background-color:\s*var\(--color-surface-raised\);/);
  });

  it("draws the tick with the icon set's `check` rather than a second path", () => {
    const { container } = render(<Icon name="check" />);
    const drawn = [...container.querySelectorAll("path")].map((glyph) =>
      glyph.getAttribute("d"),
    );
    expect(drawn).toHaveLength(1);

    const [, uri] =
      ruleFor(".checkbox-box::after").match(/mask-image:\s*url\("([^"]+)"\)/) ??
      [];
    const [, masked] =
      decodeURIComponent(uri ?? "").match(/<path d='([^']+)'/) ?? [];
    expect(masked, "the tick's mask names no path").toBeDefined();
    expect(masked).toBe(drawn[0]);
  });

  it("is round for a radio and not for a checkbox", () => {
    // The shape is what says *one of these* rather than *any of these*, so the
    // two must never read as the same control.
    expect(radioClass).toContain("rounded-full");
    expect(checkboxClass).not.toContain("rounded-full");
    expect(checkboxClass).toMatch(/\brounded-sm\b/);
    // A dot rather than a tick, and nothing masked into it.
    expect(ruleFor(".radio-dot::after")).toMatch(
      /border-radius:\s*var\(--radius-full\);/,
    );
    expect(ruleFor(".radio-dot::after")).not.toContain("mask-image");
  });

  it("reads as disabled as clearly as the switch does", () => {
    // The theme radios go disabled the moment follow-system is on.
    for (const treatment of [checkboxClass, radioClass]) {
      expect(treatment).toMatch(/disabled:opacity-40/);
    }
    expect(ruleFor(".checkbox-box:disabled,\n.radio-dot:disabled")).toMatch(
      /cursor:\s*default;/,
    );
  });

  it("keeps a focus ring that High-contrast cannot outrank", () => {
    // The hairline `soft-fill` puts back in that theme is a compound selector,
    // so the global bare `:focus-visible` loses to it — as the switch found.
    const ring = ruleFor(".checkbox-box:focus-visible,\n.radio-dot:focus-visible");
    expect(ring).toMatch(/outline:\s*2px solid var\(--color-accent\);/);
    expect(ring).toMatch(/outline-offset:\s*2px;/);
    expect(stylesheet.indexOf(".checkbox-box:focus-visible")).toBeGreaterThan(
      stylesheet.indexOf('[data-theme="high-contrast"] :is(.soft-fill'),
    );
  });

  it("outlines rather than soft-fills in High-contrast", () => {
    // Both wear `soft-fill`, which is the utility that already varies its
    // fidelity by theme — so the outline arrives without a rule of its own.
    for (const treatment of [checkboxClass, radioClass]) {
      expect(treatment).toContain("soft-fill");
    }
    expect(stylesheet).toMatch(
      /\[data-theme="high-contrast"\] :is\(\.soft-fill/,
    );
  });

  it("names a motion tier for every transition and no number anywhere", () => {
    for (const treatment of [checkboxClass, radioClass]) {
      expect(treatment).toMatch(/\btransition-colors\b/);
      expect(treatment).toMatch(/\bmotion-quick\b/);
    }
    for (const body of [base, checked, mark, ruleFor(".radio-dot::after")]) {
      expect(body).not.toMatch(/\b\d+(?:\.\d+)?m?s\b/);
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      for (const [, timing] of body.matchAll(/transition:\s*([^;]+);/g)) {
        expect(timing).toMatch(/var\(--motion-[\w-]+\)/);
      }
    }
  });
});
