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
  try {
    await browser.waitUntil(
      async () =>
        new RegExp(`^\\D*${step}\\b`).test(await browser.$("section header p").getText()),
      { timeout: PATIENCE },
    );
  } catch {
    // A step that does not advance has usually been refused, and the form says
    // so on screen. Without this the report is "never reached step 3" and the
    // reason is in a screenshot nobody took.
    throw new Error(`the wizard never reached step ${step}${await refusal(browser)}`);
  }
}

/** Whatever the form is complaining about, if it is complaining. */
async function refusal(browser: Browser): Promise<string> {
  const alerts = await browser.$$("[role=alert]").getElements();
  if (alerts.length === 0) {
    return "";
  }
  return ` — the form says "${await alerts[0].getText()}"`;
}

/** Fills the step's fields in the order they are asked for. */
async function fill(browser: Browser, values: string[]): Promise<void> {
  const fields = await browser.$$("section form input").getElements();
  for (const [index, value] of values.entries()) {
    await fields[index].setValue(value);
  }
}

/**
 * Presses the step's own button, once it will take a press.
 *
 * Waiting for it to be enabled is the whole of this function's reason to
 * exist. Next is `disabled` while a write is in flight, and the write that
 * moves the wizard on is still in flight in the render that moves it: the step
 * changes in the mutation's `onSuccess`, and `isPending` does not clear until
 * it settles. So the step after can be on screen with its button briefly dead
 * — and a WebDriver click on a disabled button is not an error, it is nothing
 * at all, which then reads as a step that would not advance.
 *
 * Rare enough to pass locally a dozen times and fail on a CI runner, which is
 * exactly how it did.
 */
async function next(browser: Browser): Promise<void> {
  const button = browser.$("section form button[type=submit]");
  await button.waitForEnabled({ timeout: PATIENCE });
  await button.click();
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
