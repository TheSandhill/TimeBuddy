import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { router } from "../router";
import { routeDirection, TAB_ORDER } from "./route-direction";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesheet = readFileSync(path.join(srcDir, "styles.css"), "utf8");

/**
 * A route change is now a view transition, and its direction crosses from
 * TypeScript into CSS as a *name*: the router hands the browser a type, and the
 * stylesheet selects on it with `:active-view-transition-type()`. Nothing type-
 * checks that crossing — a direction renamed on one side leaves the other
 * selecting on a string nobody sends, and the screen simply stops leaning.
 *
 * So the seam is guarded here, the way `tokens.test.ts` guards the one between
 * the token contract and the stylesheet.
 */
function typesFor(from: string | null, to: string): string[] {
  const option = router.options.defaultViewTransition;

  expect(
    typeof option === "object" && typeof option.types === "function",
    "the router no longer names a direction for a route change",
  ).toBe(true);

  const types = (
    option as { types: (info: Record<string, unknown>) => string[] }
  ).types({
    fromLocation: from === null ? undefined : { pathname: from },
    toLocation: { pathname: to },
    pathChanged: from !== to,
    hrefChanged: from !== to,
    hashChanged: false,
  });

  return types;
}

describe("the direction a route change leans", () => {
  it("is the tab bar's order, decided once on the router", () => {
    expect(typesFor("/", "/entries")).toEqual(["right"]);
    expect(typesFor("/settings", "/clients")).toEqual(["left"]);
  });

  it("is neutral for the first screen, which came from nowhere", () => {
    // The app opening on the Timer, and the tray pulling it up: there is no
    // previous tab, so there is no order to lean along.
    expect(typesFor(null, "/")).toEqual(["neutral"]);
  });

  it("names a direction for every pair of tabs, and only known ones", () => {
    const named = new Set<string>();

    for (const from of TAB_ORDER) {
      for (const to of TAB_ORDER) {
        const [type, ...rest] = typesFor(from, to);
        expect(rest, `${from} → ${to} named more than one direction`).toEqual(
          [],
        );
        expect(type).toBe(routeDirection(from, to));
        named.add(type);
      }
    }

    expect(named).toEqual(new Set(["left", "right", "neutral"]));
  });
});

describe("the stylesheet answers the directions the router sends", () => {
  const selected = new Set(
    [
      ...stylesheet.matchAll(/:active-view-transition-type\(([\w-]+)\)/g),
    ].map(([, type]) => type),
  );

  it("leans the screen for each direction that is a direction", () => {
    // `neutral` is deliberately absent: it is the `--screen-shift: 0px` the
    // root already carries, which is also the fallback wherever the selector
    // itself is not understood.
    expect(selected).toEqual(new Set(["left", "right"]));
  });

  it("selects on nothing the router cannot send", () => {
    const sendable = new Set(
      TAB_ORDER.flatMap((from) => TAB_ORDER.map((to) => routeDirection(from, to))),
    );

    for (const type of selected) {
      expect(sendable, `styles.css selects on "${type}", which is never sent`)
        .toContain(type);
    }
  });

  it("gives the screen a name to be snapshotted by, and takes the root's away", () => {
    expect(stylesheet).toMatch(/@utility screen-slide\s*\{[^}]*view-transition-name:\s*screen/);
    expect(stylesheet).toMatch(/:root\s*\{[^}]*view-transition-name:\s*none/);
  });

  it("spends the route tier and the travel, never a number", () => {
    const [, out] =
      stylesheet.match(/::view-transition-old\(screen\)\s*\{([^}]*)\}/) ?? [];
    const [, into] =
      stylesheet.match(/::view-transition-new\(screen\)\s*\{([^}]*)\}/) ?? [];

    expect(out, "no ::view-transition-old(screen) rule").toBeDefined();
    expect(into, "no ::view-transition-new(screen) rule").toBeDefined();

    for (const rule of [out, into]) {
      expect(rule).toContain("var(--motion-page)");
      expect(rule).toContain("var(--ease-out-soft)");
    }

    // The distance is the token's, so reduced motion flattens the lean to
    // nothing through the same hands that flatten the duration.
    expect(stylesheet).toMatch(
      /--screen-shift:[^;]*var\(--motion-page-travel\)/,
    );
  });
});
