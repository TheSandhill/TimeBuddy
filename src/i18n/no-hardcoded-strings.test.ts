import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fg from "fast-glob";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Attributes the user can read or hear. Everything else may hold literals. */
const visibleAttributes = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "placeholder",
  "title",
]);

const hasWords = (text: string) => /\p{L}{2,}/u.test(text);

/**
 * CONTEXT.md: "No hardcoded UI strings, from the first commit." Every visible
 * string goes through `t()` so the nl and en catalogues stay complete.
 */
function findHardcodedStrings(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const offenders: string[] = [];

  const report = (node: ts.Node, text: string) => {
    const { line } = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    offenders.push(
      `${path.relative(srcDir, file)}:${line + 1}: ${text.trim()}`,
    );
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasWords(node.text)) {
      report(node, node.text);
    }

    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      visibleAttributes.has(node.name.text)
    ) {
      const value = node.initializer;
      if (value && ts.isStringLiteral(value) && hasWords(value.text)) {
        report(node, `${node.name.text}="${value.text}"`);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return offenders;
}

describe("no hardcoded UI strings", () => {
  it("routes every visible string through i18next", () => {
    const files = fg.sync("**/*.tsx", {
      cwd: srcDir,
      absolute: true,
      ignore: ["**/*.test.tsx"],
    });
    expect(files.length, "guard scanned no files").toBeGreaterThan(0);

    expect(files.flatMap(findHardcodedStrings)).toEqual([]);
  });
});
