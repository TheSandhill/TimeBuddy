import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { srcDir } from "../test/class-lists";
import { selectButtonClass } from "./field";
import { Icon } from "./icon";
import { Select } from "./select";

const stylesheet = readFileSync(path.join(srcDir, "styles.css"), "utf8");

/**
 * What the platform answers when asked whether it can draw the list itself.
 *
 * jsdom has a `CSS` object with no `supports` on it, which is also the shape of
 * a browser too old to have been asked — so "cannot be asked" is a case the
 * component has to survive rather than a contrivance of the test.
 */
function platformAnswers(supported: boolean | "cannot be asked") {
  const css = CSS as unknown as { supports?: unknown };
  if (supported === "cannot be asked") {
    delete css.supports;
    return;
  }
  css.supports = vi.fn(() => supported);
}

afterEach(() => {
  delete (CSS as unknown as { supports?: unknown }).supports;
});

const options = (
  <>
    <option value="1">Acme</option>
    <option value="2">Umbrella</option>
  </>
);

/** The path the icon set draws for `chevron`, whatever it is today. */
const chevron = () => {
  const { container, unmount } = render(<Icon name="chevron" />);
  const drawn = container.querySelector("path")?.getAttribute("d");
  unmount();
  return drawn;
};

describe("a select that dresses its own list", () => {
  it("stays a plain select where base-select is unsupported", () => {
    platformAnswers(false);
    const { container } = render(
      <Select aria-label="Project" className="rounded-md">
        {options}
      </Select>,
    );

    const select = screen.getByLabelText("Project");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveClass("rounded-md");
    // Nothing but options: the native popup renders exactly as it does today.
    expect(container.querySelector("select > button")).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("stays a plain select where nothing can be asked at all", () => {
    platformAnswers("cannot be asked");
    const { container } = render(
      <Select aria-label="Project">{options}</Select>,
    );

    expect(container.querySelector("select > button")).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("rebases the closed field into a button holding the selection", () => {
    platformAnswers(true);
    const { container } = render(
      <Select aria-label="Project" defaultValue="2">
        {options}
      </Select>,
    );

    const button = container.querySelector("select > button");
    expect(button).not.toBeNull();
    // The selection's own text, drawn by the browser rather than copied here.
    expect(button?.querySelector("selectedcontent")).not.toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("draws the caret with the icon set rather than the user agent's triangle", () => {
    platformAnswers(true);
    const { container } = render(
      <Select aria-label="Project">{options}</Select>,
    );

    const caret = container.querySelector("select > button svg");
    expect(caret?.querySelector("path")?.getAttribute("d")).toBe(chevron());
    // The glyph points up and is turned by the caller, so `:open` turns it back
    // rather than swapping in a second path (ADR-0014).
    expect(caret).toHaveClass("rotate-180");
  });

  it("keeps the onChange contract whichever list is drawn", () => {
    for (const supported of [true, false]) {
      platformAnswers(supported);
      const changed = vi.fn();
      const { unmount } = render(
        <Select aria-label="Project" value="1" onChange={changed}>
          {options}
        </Select>,
      );

      fireEvent.change(screen.getByLabelText("Project"), {
        target: { value: "2" },
      });

      expect(changed, `supported: ${supported}`).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("leaves the closed field's own box the only one", () => {
    // `fieldClass` and `pickerClass` still hold the radius, the fill and the
    // padding. A button bringing its own inside them would grow the field —
    // which is the one thing this change may not do.
    for (const reset of ["border-0", "bg-transparent", "p-0", "min-w-0"]) {
      expect(selectButtonClass, reset).toContain(reset);
    }
  });

  it("passes the disabled state through untouched", () => {
    platformAnswers(true);
    render(
      <Select aria-label="Project" disabled>
        {options}
      </Select>,
    );

    expect(screen.getByLabelText("Project")).toBeDisabled();
  });
});

/**
 * The half Tailwind cannot reach. A pseudo-element has no class to hang a
 * utility on, so the panel and its options are dressed in `styles.css` — and
 * those rules are read here the way the token guards read the theme blocks.
 */
describe("the open list wears the theme", () => {
  /**
   * The body of the rule this selector alone opens — `select::picker(select)`
   * being the panel's own dressing rather than the opt-in it shares with the
   * field, or the edge High-contrast adds to it.
   */
  const ruleFor = (selector: string) => {
    const opens = `${selector} {`;
    for (let at = stylesheet.indexOf(opens); at > -1; ) {
      const lineStart = stylesheet.lastIndexOf("\n", at - 1) + 1;
      // The whole of its own line, and not the tail of a selector list, so the
      // opt-in the field and the picker share is not mistaken for the panel's
      // own dressing.
      if (
        stylesheet.slice(lineStart, at).trim() === "" &&
        stylesheet[lineStart - 2] !== ","
      ) {
        const body = stylesheet.slice(at + opens.length);
        return body.slice(0, body.indexOf("}"));
      }
      at = stylesheet.indexOf(opens, at + 1);
    }
    expect.fail(`no rule for \`${selector}\` on its own`);
  };

  /** The same, with the prose taken out — for asserting what is *not* there. */
  const declarationsIn = (selector: string) =>
    ruleFor(selector).replace(/\/\*[\s\S]*?\*\//g, "");

  it("opts both the field and its picker in", () => {
    expect(stylesheet).toContain("appearance: base-select");
    expect(stylesheet).toContain("::picker(select)");
  });

  it("makes the panel a raised fill on a radius token", () => {
    const panel = ruleFor("select::picker(select)");

    expect(panel).toContain("var(--color-surface-raised)");
    expect(panel).toContain("border-radius: var(--radius-");
    // A line round it would be the outlined box the overhaul removed.
    expect(panel).toContain("border: 0");
  });

  it("opens below the field, and nowhere else", () => {
    const panel = ruleFor("select::picker(select)");

    // The user agent lays the panel over the field and flips it above when the
    // room below is short — which on the Timer put the list over the countdown.
    expect(panel).toContain("position-area: block-end span-inline-end");
    expect(panel).toContain("position-try-fallbacks: none");
    // And it is drawn over what is beneath it at the height the list needs. A
    // max-height here would clamp it to the gap below the field and turn a list
    // of four projects into a scroller — which is not what "on top" means.
    const declarations = declarationsIn("select::picker(select)");
    expect(declarations).not.toContain("max-height");
    expect(declarations).not.toContain("overflow-y");
  });

  it("sits the rows apart rather than flush", () => {
    // Two fills touching read as one block with a line through it, and an
    // option's own radius needs somewhere to be seen.
    expect(ruleFor("select option + option")).toContain("margin-top:");
  });

  it("carries the floating tab bar's shadow, not one of its own", () => {
    // Both are laid over the screen rather than part of it. The utility itself
    // rather than a copy of the offsets it resolves to, so the two cannot drift.
    expect(ruleFor("select::picker(select)")).toContain("@apply shadow-lg");
    expect(
      readFileSync(path.join(srcDir, "components/tab-bar.tsx"), "utf8"),
      "the tab bar no longer wears shadow-lg",
    ).toContain("shadow-lg");
  });

  it("gives High-contrast the edge it needs", () => {
    const edge = ruleFor('[data-theme="high-contrast"] select::picker(select)');

    expect(edge).toContain("outline: 1px solid var(--color-border)");
  });

  it("gives an option padding and a radius of its own", () => {
    const option = ruleFor("select option");

    expect(option).toContain("padding:");
    expect(option).toContain("border-radius: var(--radius-");
  });

  it("leaves a native popup's options exactly as they are", () => {
    // Unguarded, these rules would reach the options of an OS popup too, on a
    // platform that honours some of them and ignores the rest — a half-applied
    // treatment being the thing this whole change exists to remove.
    const opens = stylesheet.indexOf("@supports (appearance: base-select) {");
    expect(opens, "no support gate at all").toBeGreaterThan(-1);

    let depth = 0;
    let closes = opens;
    for (; closes < stylesheet.length; closes += 1) {
      if (stylesheet[closes] === "{") depth += 1;
      if (stylesheet[closes] === "}" && (depth -= 1) === 0) break;
    }

    const rules = [...stylesheet.matchAll(/^\s*select option[^\n]*\{$/gm)];
    expect(rules.length, "no options dressed at all").toBeGreaterThan(0);

    for (const rule of rules) {
      expect(rule.index, rule[0].trim()).toBeGreaterThan(opens);
      expect(rule.index, rule[0].trim()).toBeLessThan(closes);
    }
  });

  it("never puts a selector after the picker, which the build would drop", () => {
    // Lightning CSS models `::picker(select)` as an ordinary pseudo-element, so
    // a rule with anything after it is thrown away silently on the way to
    // `dist`. Found the hard way: the option rules built green and shipped
    // nothing.
    for (const line of stylesheet.split("\n")) {
      if (line.includes("::picker(select)") && line.trimEnd().endsWith("{")) {
        expect(line.trimEnd(), line).toMatch(/::picker\(select\)\s*\{$/);
      }
    }
  });

  it("highlights the hovered and the keyboard-active option in the accent", () => {
    const highlight = ruleFor("select option:is(:hover, :focus, :active)");

    expect(highlight).toContain("background-color: var(--color-accent)");
    // The ink that stays legible on the accent in all three themes — the same
    // pairing the switch thumb relies on, and contrast.test.ts guards it.
    expect(highlight).toContain("color: var(--color-surface-raised)");
  });

  it("marks the selected option rather than leaning on the highlight", () => {
    expect(ruleFor("select option:checked")).toContain(
      "background-color: var(--color-surface-soft)",
    );
    expect(stylesheet).toContain("::checkmark");
    // That fill is 1.04:1 on the panel in High-contrast, so there the selection
    // gets the edge instead — the answer `soft-fill` already gives.
    expect(
      ruleFor('[data-theme="high-contrast"] select option:checked'),
    ).toContain("outline: 1px solid var(--color-border)");
  });

  it("still highlights the selected option when it is the one you are on", () => {
    // The row the keyboard lands on the moment the list opens is the checked
    // one, and `option:checked` is a class-specificity selector. A highlight
    // written with `:where()` would lose to it and leave the likeliest row flat.
    const highlight = stylesheet.indexOf(
      "select option:is(:hover, :focus, :active) {",
    );
    const checked = stylesheet.indexOf("select option:checked {");

    expect(checked, "no selected-option rule").toBeGreaterThan(-1);
    expect(highlight, "the highlight is not written to win").toBeGreaterThan(
      checked,
    );
  });

  it("names a motion tier for every colour it moves", () => {
    for (const selector of ["select::picker(select)", "select option"]) {
      const declarations = ruleFor(selector)
        .split(";")
        .filter((line) => line.trimStart().startsWith("transition"));

      for (const declaration of declarations) {
        expect(declaration, selector).toContain("var(--motion-");
        expect(declaration, selector).not.toMatch(/[0-9]+m?s/);
      }
    }
  });
});
