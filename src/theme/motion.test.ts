import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import {
  classListsOf,
  componentSources,
  lineOf,
  parse,
  utilitiesOf,
} from "../test/class-lists";
import { readDuration, readEasing } from "./motion";
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

  /**
   * Inside a `transition: { … }` — the motion library's way of saying the same
   * thing a class list says, and the easiest place to forget the rule, because
   * nothing about a bare number there looks like a duration.
   *
   * Only inside that object: `duration` is an ordinary domain word in this app,
   * and a Pomodoro Block's `{ duration: 25 }` is minutes rather than motion.
   */
  const reportTypedInMotion = (transition: ts.ObjectLiteralExpression) => {
    for (const property of transition.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        /^(?:duration|delay|ease|easing)$/.test(property.name.getText(file)) &&
        (ts.isNumericLiteral(property.initializer) ||
          ts.isStringLiteralLike(property.initializer) ||
          ts.isArrayLiteralExpression(property.initializer))
      ) {
        report(
          lineOf(file, property),
          `a typed-in ${property.name.getText(file)}: it belongs to the theme`,
        );
      }
    }
  };

  // The same defect wearing a style object: `style={{ transitionDuration }}`.
  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      /^(?:transition|animation)Duration$/.test(node.name.getText(file))
    ) {
      report(lineOf(file, node), `a literal ${node.name.getText(file)}`);
    }

    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(file) === "transition" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      reportTypedInMotion(node.initializer);
    }

    // The same object handed straight to a component: `transition={{ … }}`.
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === "transition" &&
      node.initializer !== undefined &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression !== undefined &&
      ts.isObjectLiteralExpression(node.initializer.expression)
    ) {
      reportTypedInMotion(node.initializer.expression);
    }

    ts.forEachChild(node, visit);
  };
  visit(file);

  return offenders;
}

/**
 * Asking for less motion, anywhere but the tokens. Read through the AST like
 * its siblings, so prose about reduced motion — this file is full of it — is
 * prose, and only a media query actually consulted or the library's own hook
 * counts as a second code path.
 */
function findReducedMotionPaths(fileName: string, source: string): string[] {
  const file = parse(fileName, source);
  const offenders: string[] = [];

  const report = (line: number, reason: string) =>
    offenders.push(`${fileName}:${line}: ${reason}`);

  for (const { text, line } of classListsOf(file)) {
    if (text.includes("prefers-reduced-motion")) {
      report(line, "a reduced-motion query: the tokens have already answered");
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && /^(?:useR|r)educedMotion$/.test(node.text)) {
      report(
        lineOf(file, node),
        `${node.text}: the tokens have already answered`,
      );
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

  it("fails a duration or a curve typed into a JavaScript transition", () => {
    expect(
      reasons(`const a = { transition: { duration: 0.22, ease: "linear" } };`),
    ).toEqual([
      "a typed-in duration: it belongs to the theme",
      "a typed-in ease: it belongs to the theme",
    ]);
    expect(
      reasons(`const a = { transition: { ease: [0.16, 0.84, 0.44, 1] } };`),
    ).toContain("a typed-in ease: it belongs to the theme");
  });

  it("passes a transition that asks the theme", () => {
    expect(
      reasons(
        `const a = { transition: { duration: readDuration("--motion-base") } };`,
      ),
    ).toEqual([]);
  });

  it("leaves a duration that is not a duration alone", () => {
    // The word is the domain's before it is motion's: a Block is 25 minutes.
    expect(reasons(`const block = { duration: 25, projectId: 3 };`)).toEqual([]);
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

  /**
   * The other half of the same rule. Asking for less motion is the theme's
   * answer — the tokens are already turned down by the time anything reads
   * them — so a component that asks the operating system itself, or lets the
   * library ask on its behalf, has grown the second code path this design
   * exists to avoid (`CONTEXT.md` → Motion).
   */
  it("finds nobody asking for less motion outside the tokens", () => {
    const fixture = (source: string) =>
      findReducedMotionPaths("fixture.tsx", source).map((offence) =>
        offence.slice(offence.indexOf(": ") + 2),
      );

    expect(
      fixture(`const still = matchMedia("(prefers-reduced-motion: reduce)");`),
    ).toContain("a reduced-motion query: the tokens have already answered");
    expect(fixture(`const off = useReducedMotion();`)).toContain(
      "useReducedMotion: the tokens have already answered",
    );
    // The prose this very file is full of is not a second code path.
    expect(fixture(`// prefers-reduced-motion turns these down\nconst a = 1;`))
      .toEqual([]);

    const offenders = componentSources().flatMap(({ fileName, source }) =>
      findReducedMotionPaths(fileName, source),
    );

    expect(offenders).toEqual([]);
  });
});

describe("reading a duration off the theme", () => {
  const root = document.documentElement;

  afterEach(() => {
    root.removeAttribute("style");
  });

  it("answers in the seconds the motion library speaks", () => {
    root.style.setProperty("--motion-base", "220ms");

    expect(readDuration("--motion-base")).toBeCloseTo(0.22);
  });

  it("reads a duration written in seconds too", () => {
    root.style.setProperty("--motion-page", "0.28s");

    expect(readDuration("--motion-page")).toBeCloseTo(0.28);
  });

  it("needs no code path of its own to be turned down", () => {
    // What High-contrast and `prefers-reduced-motion` both do to every tier.
    root.style.setProperty("--motion-deliberate", "1ms");

    expect(readDuration("--motion-deliberate")).toBeCloseTo(0.001);
  });

  it("is instant rather than broken when nothing answers", () => {
    // No stylesheet — a test environment, or a theme mid-swap.
    expect(readDuration("--motion-bounce")).toBe(0);
  });
});

describe("reading an easing off the theme", () => {
  const root = document.documentElement;

  afterEach(() => {
    root.removeAttribute("style");
  });

  it("hands the library the four control points", () => {
    root.style.setProperty(
      "--ease-out-soft",
      "cubic-bezier(0.16, 0.84, 0.44, 1)",
    );

    expect(readEasing("--ease-out-soft")).toEqual([0.16, 0.84, 0.44, 1]);
  });

  it("passes a flattened curve through as itself", () => {
    // High-contrast flattens both bounces: an overshoot is a movement past the
    // answer, which is what a theme asked to stop moving must not do.
    root.style.setProperty("--ease-bounce-soft", "linear");

    expect(readEasing("--ease-bounce-soft")).toBe("linear");
  });

  it("falls back to linear rather than to nothing", () => {
    expect(readEasing("--ease-in-quick")).toBe("linear");

    root.style.setProperty("--ease-in-quick", "cubic-bezier(0.4, 0)");
    expect(readEasing("--ease-in-quick")).toBe("linear");
  });
});
