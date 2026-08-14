import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  classListsOf,
  componentSources,
  lineOf,
  parse,
  utilitiesOf,
} from "../test/class-lists";

/**
 * The two files that are allowed to dress a control. Everything else imports
 * from them, so reshaping the vocabulary once reshapes every screen.
 */
const sharedModules = new Set(["components/button.ts", "components/field.ts"]);

/** What a constant is called when it is a control treatment in disguise. */
const treatmentName =
  /(?:button|field|label|legend|chip|checkbox|toggle|control)(?:class)?$/i;

/**
 * The rules that are about the look of a class list rather than about who
 * declared it.
 *
 * Tracked capitals are the wall of uppercase the overhaul exists to remove, and
 * a neutral line drawn round a rounded fill is the outlined box it replaces. A
 * line in a meaningful colour is left alone: `border-danger` on a failure and
 * `border-hairline` where a division genuinely has to be drawn both say
 * something, which is the whole test of whether a border survives.
 */
function offencesInClassList(classList: string, shared: boolean): string[] {
  const utilities = utilitiesOf(classList);
  const has = (pattern: RegExp) => utilities.some((name) => pattern.test(name));

  const reasons = new Set<string>();

  if (utilities.includes("uppercase") && has(/^tracking-/)) {
    reasons.add("tracked capitals: a label is sentence case and quiet");
  }

  const rounded = has(/^rounded(?:-|$)/);
  const neutral = has(/^border(?:-[xytblr])?-border$/);
  const bare = has(/^border(?:-[xytblr])?$/);
  const coloured = has(/^border(?:-[xytblr])?-(?!border$)[a-z]/);

  if (rounded && (neutral || (bare && !coloured))) {
    reasons.add("an outlined box: a soft raised fill needs no line round it");
  }

  // The fill that dresses a field or a quiet control. A screen reaching for it
  // is inventing one of those, whatever it calls the string it puts it in.
  if (!shared && has(/^(?:soft-fill|bg-surface-soft)$/)) {
    reasons.add(
      "the control fill: a field or a control belongs to the vocabulary",
    );
  }

  return [...reasons];
}

/**
 * ADR-0004's sibling rule for shape: the form vocabulary lives in two files, and
 * a screen that re-decides what a button looks like is a defect in the way a raw
 * hex is.
 */
function findVocabularyOffences(fileName: string, source: string): string[] {
  const file = parse(fileName, source);
  const shared = sharedModules.has(fileName.split("\\").join("/"));

  const offenders: string[] = [];
  const report = (line: number, reason: string) =>
    offenders.push(`${fileName}:${line}: ${reason}`);

  for (const { text, line } of classListsOf(file)) {
    for (const reason of offencesInClassList(text, shared)) {
      report(line, reason);
    }
  }

  /**
   * A constant holding a string and named after a control. Only string-valued
   * ones: `const rowButton = "…"` is a treatment, and a component or a boolean
   * that happens to end in the same word is not.
   */
  const visit = (node: ts.Node) => {
    if (
      !shared &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      treatmentName.test(node.name.text) &&
      node.initializer !== undefined &&
      (ts.isStringLiteralLike(node.initializer) ||
        ts.isTemplateExpression(node.initializer) ||
        // A class list long enough to be split over two lines. Only `+`: a
        // comparison named after a control is a boolean, not a treatment.
        (ts.isBinaryExpression(node.initializer) &&
          node.initializer.operatorToken.kind === ts.SyntaxKind.PlusToken))
    ) {
      report(
        lineOf(file, node),
        `a competing treatment: ${node.name.text} belongs in the shared vocabulary`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return offenders;
}

describe("the vocabulary guard", () => {
  const reasons = (source: string, fileName = "routes/fixture.tsx") =>
    findVocabularyOffences(fileName, source).map((offence) =>
      offence.slice(offence.indexOf(": ") + 2),
    );

  it("fails on tracked capitals", () => {
    expect(reasons(`const a = "text-xs uppercase tracking-widest";`)).toContain(
      "tracked capitals: a label is sentence case and quiet",
    );
    expect(reasons(`const a = "text-sm tracking-wide text-ink";`)).toEqual([]);
  });

  it("fails on a rounded box outlined in the neutral border colour", () => {
    expect(
      reasons(`const a = "rounded-md border border-border bg-surface px-3";`),
    ).toContain("an outlined box: a soft raised fill needs no line round it");
    expect(reasons(`const a = "rounded-full border px-3 py-1";`)).toContain(
      "an outlined box: a soft raised fill needs no line round it",
    );
  });

  it("leaves a line that carries meaning alone", () => {
    // A failure, a hairline division, and a strip that is not a box at all.
    expect(reasons(`const a = "rounded-lg border border-danger p-5";`)).toEqual(
      [],
    );
    expect(
      reasons(`const a = "rounded-md border border-hairline px-3 py-2";`),
    ).toEqual([]);
    expect(reasons(`const a = "border-b border-border px-6 py-2";`)).toEqual(
      [],
    );
    expect(reasons(`const a = "divide-y divide-border";`)).toEqual([]);
  });

  it("fails a screen dressing a control in the grouping fill", () => {
    // The hole a name-based rule leaves: no constant, no telling name.
    expect(
      reasons(
        `const a = <input className="rounded-md soft-fill px-3 py-2" />;`,
      ),
    ).toContain(
      "the control fill: a field or a control belongs to the vocabulary",
    );
    expect(reasons(`const a = "bg-surface-soft px-4 py-2 text-sm";`)).toContain(
      "the control fill: a field or a control belongs to the vocabulary",
    );
  });

  it("fails a screen that declares its own control treatment", () => {
    expect(reasons(`const quietButtonClass = "px-3";`)).toContain(
      "a competing treatment: quietButtonClass belongs in the shared vocabulary",
    );
    expect(reasons(`const legendClass = "text-xs";`)).toContain(
      "a competing treatment: legendClass belongs in the shared vocabulary",
    );
    // The name the guard used to miss: a treatment need not say "class".
    expect(reasons(`const rowButton = "text-xs " + "text-ink";`)).toContain(
      "a competing treatment: rowButton belongs in the shared vocabulary",
    );
  });

  it("leaves alone what only reads like a treatment", () => {
    // A component, a boolean and a catalogue key are not dressing anything.
    expect(reasons(`const UndoToast = () => null;`)).toEqual([]);
    expect(reasons(`const chosenLabel = t("timer.preset");`)).toEqual([]);
    expect(reasons(`const showLabel = minutes === value;`)).toEqual([]);
  });

  it("lets the shared vocabulary declare the vocabulary", () => {
    expect(
      reasons(
        `const quietButtonClass = "soft-fill px-4 py-2";`,
        "components/button.ts",
      ),
    ).toEqual([]);
    expect(
      reasons(`const labelClass = "text-xs";`, "components/field.ts"),
    ).toEqual([]);
  });
});

describe("one form vocabulary, shared", () => {
  it("finds no competing control treatment in component source", () => {
    const sources = componentSources();
    expect(sources.length, "guard scanned no files").toBeGreaterThan(0);

    const offenders = sources.flatMap(({ fileName, source }) =>
      findVocabularyOffences(fileName, source),
    );

    expect(offenders).toEqual([]);
  });
});
