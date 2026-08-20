import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `src/styles.css`, as text, for the tests that assert on the stylesheet rather
 * than on a rendered tree.
 *
 * Here rather than in each of them for the reason `class-lists.ts` gives for the
 * agreement it holds: three copies of `readFileSync(join(srcDir, …))` is three
 * places to fix when the file moves, and the third one is always missed.
 *
 * Read once at import. Nothing writes to it during a run, and a token contract
 * that re-read the file per assertion would be slower for no benefit.
 */
export const stylesheet = readFileSync(
  path.join(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    "styles.css",
  ),
  "utf8",
);

/**
 * A theme token's declared value, from the default (`@theme`) block.
 *
 * For tests that need the *number* a token holds rather than the fact that it is
 * declared. Restating one in a test — `const DIGIT_PX = 60` beside a
 * `--text-dial: 60px` — is a second source of truth that goes quietly stale the
 * first time the theme is retuned, which is exactly what happened to the digits.
 */
export function tokenPx(token: string): number {
  // `String.raw`, because a plain template literal swallows the backslashes and
  // leaves `\s*(\d+)` as the literal `s*(d+)`, which quietly matches nothing.
  const [, value] =
    stylesheet.match(new RegExp(String.raw`${token}:\s*(\d+(?:\.\d+)?)px`)) ??
    [];

  if (value === undefined) {
    throw new Error(`no px value for ${token} in styles.css`);
  }

  return Number(value);
}
