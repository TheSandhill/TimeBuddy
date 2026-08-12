/**
 * Close hides the window; it does not quit the app (ADR-0004).
 *
 * The unit tests can only get as far as "the button called `close()`". What
 * happens next is Rust's `CloseRequested` handler and a Win32 `ShowWindow`,
 * neither of which exists in jsdom — so whether the app survives its own close
 * button has never been asserted anywhere until here.
 *
 * That the tray icon is still there is asserted by implication rather than by
 * enumerating the notification area, which cannot be done from WebDriver and
 * is unreliable to do at all on Windows 11. `hide_to_tray` refuses to hide
 * when `tray_by_id` finds nothing, and a refused hide is a close that closes.
 * So a window that is hidden with the process still alive is a window with a
 * tray behind it — the two are the same fact. What this does *not* cover is
 * the menu on that icon, which is `tray-menu.e2e.ts` and a harness of its own
 * (ADR-0013).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FRAME, launchApp, type LaunchedApp } from "./support/app";
import { waitFor } from "./support/win32";

describe("closing the window", () => {
  let app: LaunchedApp;

  beforeAll(async () => {
    app = await launchApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("hides the window and leaves the app running", async () => {
    expect(app.window().visible).toBe(true);

    // Chosen by position rather than by label: the labels come from the
    // catalogues, and this test should not fail when the Dutch for "close"
    // is reworded. Minimize then close, in that order, is the titlebar.
    await app.browser.$(`${FRAME} button:last-of-type`).click();

    const hidden = await waitFor("the window to be hidden", () => {
      const window = app.window();
      return window.visible ? null : window;
    });

    expect(hidden.visible).toBe(false);
    expect(app.alive()).toBe(true);
  });
});
