import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ParsedLocation } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeDirection, TAB_ORDER } from "../components/route-direction";
import { router } from "../router";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesheet = readFileSync(path.join(srcDir, "styles.css"), "utf8");

/**
 * A route change is a view transition, and its direction crosses from
 * TypeScript into CSS as a *name*: the router hands the browser a type, and the
 * stylesheet selects on it with `:active-view-transition-type()`. Nothing type-
 * checks that crossing — a direction renamed on one side leaves the other
 * selecting on a string nobody sends, and the screen silently stops leaning.
 *
 * So the seam is guarded here, beside the guard that holds the token contract
 * and the stylesheet to each other (`tokens.test.ts`).
 */

/**
 * A location the router never made. Only `pathname` is ever read — by
 * `routeDirection`, which is the whole of what the callback does — so the rest
 * of `ParsedLocation` is deliberately absent rather than invented.
 *
 * The cast is confined to this one fake and does not reach the callback: the
 * shape of `types`, its arguments and its return value all stay checked, which
 * is the point of a file whose subject is an unchecked crossing.
 */
function at(pathname: string): ParsedLocation {
  return { pathname } as ParsedLocation;
}

function typesFor(from: string | null, to: string): string[] {
  const option = router.options.defaultViewTransition;

  if (typeof option !== "object" || typeof option.types !== "function") {
    throw new Error("the router no longer names a direction for a route change");
  }

  const types = option.types({
    fromLocation: from === null ? undefined : at(from),
    toLocation: at(to),
    pathChanged: from !== to,
    hrefChanged: from !== to,
    hashChanged: false,
  });

  // `false` is the router's way of saying "do not transition this one at all",
  // which nothing here asks for.
  expect(types, `no direction named for ${from} → ${to}`).not.toBe(false);

  return types === false ? [] : types;
}

describe("the direction a route change leans", () => {
  it("is the tab bar's order, decided once on the router", () => {
    expect(typesFor("/", "/entries")).toEqual(["right"]);
    expect(typesFor("/settings", "/clients")).toEqual(["left"]);
  });

  it("is neutral for the first screen, which came from nowhere", () => {
    // The app opening on the Timer: there is no previous tab, so there is no
    // order to lean along.
    expect(typesFor(null, "/")).toEqual(["neutral"]);
  });

  it("names exactly one direction per navigation, and delegates which", () => {
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
    [...stylesheet.matchAll(/:active-view-transition-type\(([\w-]+)\)/g)].map(
      ([, type]) => type,
    ),
  );

  it("leans the screen for each direction that is a direction", () => {
    // `neutral` is deliberately absent: it is the `--screen-travel: 0px` the
    // root already carries, which is also the fallback wherever the selector
    // itself is not understood.
    expect(selected).toEqual(new Set(["left", "right"]));
  });

  it("selects on nothing the router cannot send", () => {
    const sendable = new Set(
      TAB_ORDER.flatMap((from) =>
        TAB_ORDER.map((to) => routeDirection(from, to)),
      ),
    );

    for (const type of selected) {
      expect(
        sendable,
        `styles.css selects on "${type}", which is never sent`,
      ).toContain(type);
    }
  });

  it("gives the screen a name to be snapshotted by, and takes the root's away", () => {
    expect(stylesheet).toMatch(
      /@utility screen-slide\s*\{[^}]*view-transition-name:\s*screen/,
    );
    expect(stylesheet).toMatch(/:root\s*\{[^}]*view-transition-name:\s*none/);
  });

  it("spends the route tier and the travel, never a number", () => {
    /**
     * The group is in here with the two images on purpose. Its duration is a
     * quarter-second by user-agent default, and a rule that turns the images
     * down without it leaves reduced motion with an instant cross-fade beneath
     * a frozen overlay that outlasts it — the visuals collapsed and the
     * mechanism still running.
     */
    const rules = ["group", "old", "new"].map((part) => {
      const [, body] =
        stylesheet.match(
          new RegExp(`::view-transition-${part}\\(screen\\)\\s*\\{([^}]*)\\}`),
        ) ?? [];
      expect(body, `no ::view-transition-${part}(screen) rule`).toBeDefined();
      return body;
    });

    for (const rule of rules) {
      expect(rule).toContain("var(--motion-page)");
      expect(rule).toContain("var(--ease-out-soft)");
    }

    // The distance is the token's, so reduced motion flattens the lean to
    // nothing through the same hands that flatten the duration.
    expect(stylesheet).toMatch(
      /--screen-travel:[^;]*var\(--motion-page-travel\)/,
    );
  });
});
