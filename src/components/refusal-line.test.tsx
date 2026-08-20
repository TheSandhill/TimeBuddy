import { render, screen } from "@testing-library/react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { componentSources, lineOf, parse } from "../test/class-lists";
import { glyphOf, pathsIn } from "../test/glyph";
import { RefusalLine } from "./refusal-line";

describe("the line the app says when something was refused", () => {
  it("says nothing at all when there is nothing to say", () => {
    const { container } = render(<RefusalLine message={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("announces the refusal, because one nobody is told about did not happen", () => {
    render(<RefusalLine message="Deze naam bestaat al" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Deze naam bestaat al");
  });

  it("wears `error`: the user asked for something and it did not happen", () => {
    render(<RefusalLine message="Deze naam bestaat al" />);

    expect(pathsIn(screen.getByRole("alert"))).toEqual(glyphOf("error"));
  });
});

/**
 * The guard the component exists for.
 *
 * #70 dressed this file on the strength of "every form in the app gains the
 * glyph from one edit", and that was not true: nine other places had pasted the
 * paragraph inline, so the glyph reached none of them (#88). A guard is the only
 * thing that makes the sentence stay true — the paragraph is four lines, and
 * pasting it is always easier than finding this file.
 *
 * A banner is not a copy. `backup-banner`, `restore-banner`, `update-banner` and
 * `root-boundary` alert from a `div` or a `span` they lay out themselves, and
 * `restore-notice` is a `status` rather than an alert at all; each is a component
 * in its own right, wired by #70. What is forbidden is the refusal line itself —
 * a `<p>` that alerts in `text-danger` — being drawn anywhere but here.
 */
function findRefusalCopies(fileName: string, source: string): string[] {
  const file = parse(fileName, source);
  const found: string[] = [];

  const alerts = (node: ts.JsxOpeningLikeElement, name: string, is: string) =>
    node.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.name.getText(file) === name &&
        attribute.initializer !== undefined &&
        attribute.initializer
          .getText(file)
          .split(/[\s"'`{}]+/)
          .includes(is),
    );

  const visit = (node: ts.Node) => {
    if (
      ts.isJsxOpeningLikeElement(node) &&
      node.tagName.getText(file) === "p" &&
      alerts(node, "role", "alert") &&
      alerts(node, "className", "text-danger")
    ) {
      found.push(`${fileName}:${lineOf(file, node)}`);
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return found;
}

describe("the refusal-copy guard", () => {
  const copies = (source: string) =>
    findRefusalCopies("routes/fixture.tsx", source);

  it("fails the paragraph this component replaced", () => {
    expect(
      copies(
        `const a = <p role="alert" className="text-sm text-danger">{m}</p>;`,
      ),
    ).toEqual(["routes/fixture.tsx:1"]);
  });

  it("leaves a banner alerting from its own layout alone", () => {
    expect(
      copies(
        `const a = <span role="alert" className="text-sm text-danger">{m}</span>;`,
      ),
    ).toEqual([]);
  });

  it("leaves a red line nobody is told about to the colour guards", () => {
    expect(copies(`const a = <p className="text-sm text-danger">{m}</p>;`)).toEqual(
      [],
    );
  });

  it("leaves an alert that is not the refusal line alone", () => {
    expect(
      copies(`const a = <p role="alert" className="text-sm text-ink">{m}</p>;`),
    ).toEqual([]);
  });

  it("finds no second copy of the refusal line in component source", () => {
    const sources = componentSources();
    expect(sources.length, "guard scanned no files").toBeGreaterThan(0);

    expect(
      sources
        .filter(({ fileName }) => fileName !== "components/refusal-line.tsx")
        .flatMap(({ fileName, source }) => findRefusalCopies(fileName, source)),
    ).toEqual([]);
  });
});
