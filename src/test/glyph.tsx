import { render } from "@testing-library/react";
import { Icon, type IconName } from "../components/icon";

/**
 * What the set draws for a name today, as path data.
 *
 * Every glyph assertion in the suite compares against this rather than against a
 * literal `d`. A test that pinned the artwork would fail the day it is swapped,
 * which is the one thing naming a glyph for its meaning exists to make free
 * (ADR-0014) — what these tests are about is *which* name a screen reached for.
 */
export function glyphOf(name: IconName): string[] {
  const { container, unmount } = render(<Icon name={name} />);
  const drawn = pathsIn(container);
  unmount();
  return drawn;
}

/** The paths an already-rendered element draws, in document order. */
export function pathsIn(element: Element | null): string[] {
  return [...(element?.querySelectorAll("path") ?? [])].map(
    (path) => path.getAttribute("d") ?? "",
  );
}
