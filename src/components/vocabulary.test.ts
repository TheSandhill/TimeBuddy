import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fg from "fast-glob";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The two files that are allowed to dress a control. Everything else imports
 * from them, so reshaping the vocabulary once reshapes every screen.
 */
const sharedModules = new Set(["components/button.ts", "components/field.ts"]);

/** What a constant is called when it is a control treatment in disguise. */
const treatmentName =
  /(?:button|field|label|legend|chip|checkbox|input|control)class$/i;

function utilitiesOf(classList: string): string[] {
  return (
    classList
      .split(/\s+/)
      .filter(Boolean)
      // `hover:`, `md:`, `disabled:` — the utility is what follows the last one.
      .map((name) => name.slice(name.lastIndexOf(":") + 1))
  );
}

/**
 * The two rules that are about the look of a class list rather than about who
 * declared it.
 *
 * Tracked capitals are the wall of uppercase the overhaul exists to remove, and
 * a neutral line drawn round a rounded fill is the outlined box it replaces. A
 * line in a meaningful colour is left alone: `border-danger` on a failure and
 * `border-hairline` where a division genuinely has to be drawn both say
 * something, which is the whole test of whether a border survives.
 */
function offencesInClassList(classList: string): string[] {
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

  return [...reasons];
}

/**
 * ADR-0004's sibling rule for shape: the form vocabulary lives in two files, and
 * a screen that re-decides what a button looks like is a defect in the way a raw
 * hex is. Reads string literals and declarations through the TypeScript AST, so
 * prose about a border is prose.
 */
function findVocabularyOffences(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const offenders: string[] = [];
  const shared = sharedModules.has(fileName.split(path.sep).join("/"));

  const report = (node: ts.Node, reason: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    offenders.push(`${fileName}:${line + 1}: ${reason}`);
  };

  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      for (const reason of offencesInClassList(node.text)) {
        report(node, reason);
      }
    }

    if (
      !shared &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      treatmentName.test(node.name.text)
    ) {
      report(
        node,
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
    expect(reasons(`const a = "border-b border-border px-6 py-2";`)).toEqual([]);
    expect(reasons(`const a = "divide-y divide-border";`)).toEqual([]);
  });

  it("fails a screen that declares its own control treatment", () => {
    expect(reasons(`const quietButtonClass = "px-3";`)).toContain(
      "a competing treatment: quietButtonClass belongs in the shared vocabulary",
    );
    expect(reasons(`const legendClass = "text-xs";`)).toContain(
      "a competing treatment: legendClass belongs in the shared vocabulary",
    );
  });

  it("lets the shared vocabulary declare the vocabulary", () => {
    expect(
      reasons(`const quietButtonClass = "px-3";`, "components/button.ts"),
    ).toEqual([]);
    expect(
      reasons(`const labelClass = "text-xs";`, "components/field.ts"),
    ).toEqual([]);
  });
});

describe("one form vocabulary, shared", () => {
  it("finds no competing control treatment in component source", () => {
    const files = fg.sync(["**/*.{ts,tsx}"], {
      cwd: srcDir,
      absolute: true,
      ignore: ["**/*.test.{ts,tsx}"],
    });
    expect(files.length, "guard scanned no files").toBeGreaterThan(0);

    const offenders = files.flatMap((file) =>
      findVocabularyOffences(
        path.relative(srcDir, file),
        readFileSync(file, "utf8"),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
