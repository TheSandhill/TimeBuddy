/**
 * The harness the source guards share.
 *
 * Three guards now enforce ADR-0004's "a raw value in a component is a defect":
 * no raw hex, no raw duration, and one control vocabulary. All three agree that
 * a class list is a string literal read through the TypeScript AST rather than a
 * line of text — so a border or a duration mentioned in a comment is prose — and
 * all three scan the same set of files. That agreement lives here rather than in
 * three copies.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fg from "fast-glob";
import ts from "typescript";

/** `src`, whichever file inside it is asking. */
export const srcDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** A string literal that might be dressing something, and where it sits. */
export interface ClassList {
  text: string;
  /** One-based, so an offence reads like a compiler's. */
  line: number;
}

export function parse(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

export function lineOf(file: ts.SourceFile, node: ts.Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

/**
 * Every string literal in the file, template parts included.
 *
 * A class list is read as one string, so a utility and the tier or token it
 * belongs beside have to sit in the same literal. Splitting them across a
 * concatenation would hide the pairing from the guards, and from whoever reads
 * the component next.
 */
export function classListsOf(file: ts.SourceFile): ClassList[] {
  const found: ClassList[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push({ text: node.text, line: lineOf(file, node) });
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return found;
}

/** The utilities in a class list, with `hover:`, `md:` and `disabled:` stripped. */
export function utilitiesOf(classList: string): string[] {
  return classList
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => name.slice(name.lastIndexOf(":") + 1));
}

/** Everything a guard scans: component source, never the tests. */
export function componentSources(): { fileName: string; source: string }[] {
  const files = fg.sync(["**/*.{ts,tsx}"], {
    cwd: srcDir,
    absolute: true,
    ignore: ["**/*.test.{ts,tsx}"],
  });

  return files.map((file) => ({
    // Posix-separated, so a guard can compare against a path it was given.
    fileName: path.relative(srcDir, file).split(path.sep).join("/"),
    source: readFileSync(file, "utf8"),
  }));
}
