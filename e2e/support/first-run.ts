/**
 * Walking the first-run wizard, so a test has an app with work in it.
 *
 * The one place in this suite where the DOM is driven rather than merely
 * pointed at, and it is setup rather than assertion. A launch gets an empty
 * `%APPDATA%` (see `app.ts`), which is an install that has never been run — no
 * account, no Client, no Project. The tray's Start item does nothing at all in
 * that state, and rightly: there is nothing to start a block on.
 *
 * Nothing here is asserted. If the wizard is broken these steps time out, and
 * the test says it never got to the tray — which is the honest report.
 */

import type { Browser } from "webdriverio";

/** How long any one step of the walk is given. A first launch is not quick. */
const PATIENCE = 30_000;

/**
 * Which step is on screen, read off the "Stap 2 van 3" line above the form.
 *
 * The digit rather than the words: the catalogues own the sentence and this
 * suite must not fail when it is reworded, but the count of steps is a
 * decision (`CONTEXT.md`, First run) rather than a phrasing. Anchored at the
 * front because the total is a number in the same line.
 */
async function onStep(browser: Browser, step: number): Promise<void> {
  await browser.waitUntil(
    async () => new RegExp(`^\\D*${step}\\b`).test(await browser.$("section header p").getText()),
    { timeout: PATIENCE, timeoutMsg: `the wizard never reached step ${step}` },
  );
}

/** Fills the step's fields in the order they are asked for. */
async function fill(browser: Browser, values: string[]): Promise<void> {
  const fields = await browser.$$("section form input").getElements();
  for (const [index, value] of values.entries()) {
    await fields[index].setValue(value);
  }
}

async function next(browser: Browser): Promise<void> {
  await browser.$("section form button[type=submit]").click();
}

/**
 * Runs the three steps, and answers once the app itself is on screen.
 *
 * The backup folder is left alone deliberately: choosing one opens a native
 * directory dialog, which is a second thing this harness would have to drive,
 * and the default — the app's own data directory, which is the throwaway one
 * this launch was given — is the right answer for a test anyway.
 */
export async function completeFirstRun(
  browser: Browser,
  { client, project }: { client: string; project: string },
): Promise<void> {
  await onStep(browser, 1);
  // Eight characters and twelve, which is what Rust asks for.
  await fill(browser, ["e2e-password", "the e2e suite recovery phrase"]);
  await next(browser);

  await onStep(browser, 2);
  await next(browser);

  await onStep(browser, 3);
  await fill(browser, [client, project]);
  await next(browser);

  // The nav bar belongs to `AppShell` and to nothing in front of it, so its
  // arrival is the door being open and setup being finished at once.
  await browser.$("nav a").waitForDisplayed({ timeout: PATIENCE });
}
