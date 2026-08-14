import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  classListsOf,
  componentSources,
  lineOf,
  parse,
  utilitiesOf,
} from "../test/class-lists";
import { motionTiers } from "./tokens";

const tier = new RegExp(`^-?motion-(?:${motionTiers.join("|")})$`);

function offencesInClassList(classList: string): string[] {
  const utilities = utilitiesOf(classList);

  const reasons = new Set<string>();

  for (const utility of utilities) {
    if (/^-?duration-(?:\d|\[)/.test(utility)) {
      reasons.add(`a raw duration: ${utility}`);
    }
    if (/^-?ease-\[/.test(utility)) {
      reasons.add(`a bracketed easing: ${utility}`);
    }
    if (/^-?animate-\[/.test(utility)) {
      reasons.add(`a bracketed animation: ${utility}`);
    }
    if (utility.includes("[") && /\b\d+(?:\.\d+)?m?s\b/.test(utility)) {
      reasons.add(`a raw duration: ${utility}`);
    }
  }

  // Nothing rides Tailwind's implicit 150ms: a `transition-*` names its tier.
  const transitions = utilities.filter(
    (utility) =>
      /^-?transition(?:-|$)/.test(utility) && utility !== "transition-none",
  );
  if (transitions.length > 0 && !utilities.some((name) => tier.test(name))) {
    reasons.add(`${transitions.join(" ")} with no motion tier`);
  }

  return [...reasons];
}

/**
 * ADR-0004: "a raw value in a component is a defect — a hex, a duration and an
 * easing alike." This is the raw-hex guard's sibling, and it reads the source
 * through the AST rather than line by line, so a duration mentioned in a comment
 * is prose and a `setTimeout(…, 5000)` is behaviour.
 */
function findMotionOffences(fileName: string, source: string): string[] {
  const file = parse(fileName, source);
  const offenders: string[] = [];

  const report = (line: number, reason: string) =>
    offenders.push(`${fileName}:${line}: ${reason}`);

  for (const { text, line } of classListsOf(file)) {
    if (text.includes("transition-duration")) {
      report(line, "a literal transition-duration");
    }
    for (const reason of offencesInClassList(text)) {
      report(line, reason);
    }
  }

  // The same defect wearing a style object: `style={{ transitionDuration }}`.
  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      /^(?:transition|animation)Duration$/.test(node.name.getText(file))
    ) {
      report(lineOf(file, node), `a literal ${node.name.getText(file)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return offenders;
}

describe("the motion guard", () => {
  const reasons = (source: string) =>
    findMotionOffences("fixture.tsx", source).map((offence) =>
      offence.slice(offence.indexOf(": ") + 2),
    );

  it("fails on a raw duration", () => {
    expect(reasons(`const a = "transition-colors duration-150";`)).toContain(
      "a raw duration: duration-150",
    );
    expect(
      reasons(`const a = "transition-colors duration-[250ms]";`),
    ).toContain("a raw duration: duration-[250ms]");
  });

  it("fails on a bracketed easing", () => {
    expect(
      reasons(
        `const a = "transition-colors motion-quick ease-[cubic-bezier(0.4,0,1,1)]";`,
      ),
    ).toContain("a bracketed easing: ease-[cubic-bezier(0.4,0,1,1)]");
  });

  it("fails on a literal transition-duration", () => {
    expect(reasons(`const a = "[transition-duration:200ms]";`)).toContain(
      "a literal transition-duration",
    );
    expect(
      reasons(`const a = <div style={{ transitionDuration: x }} />;`),
    ).toContain("a literal transitionDuration");
  });

  it("fails a transition-* that names no tier, so nothing rides the default", () => {
    expect(reasons(`const a = "rounded-md transition-colors";`)).toContain(
      "transition-colors with no motion tier",
    );
    expect(reasons(`const a = "hover:opacity-90 md:transition";`)).toContain(
      "transition with no motion tier",
    );
  });

  it("passes a transition that names its tier", () => {
    expect(
      reasons(`const a = "transition-colors motion-quick ease-out-soft";`),
    ).toEqual([]);
    expect(
      reasons(`const a = "transition-opacity hover:opacity-90 motion-base";`),
    ).toEqual([]);
  });

  it("leaves `transition-none` alone — it is the absence of motion", () => {
    expect(reasons(`const a = "transition-none";`)).toEqual([]);
  });

  it("does not mistake behaviour for motion", () => {
    expect(
      reasons(`const UNDO_WINDOW_MS = 5000;\nsetTimeout(done, 1000);`),
    ).toEqual([]);
    // Prose about motion is not motion.
    expect(
      reasons(`// 150ms, transition-duration, ease-[whatever]\nconst a = 1;`),
    ).toEqual([]);
  });
});

describe("ADR-0004: components name a motion tier, never a number", () => {
  it("finds no raw motion in component source", () => {
    const sources = componentSources();
    expect(sources.length, "guard scanned no files").toBeGreaterThan(0);

    const offenders = sources.flatMap(({ fileName, source }) =>
      findMotionOffences(fileName, source),
    );

    expect(offenders).toEqual([]);
  });
});
