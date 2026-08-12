/**
 * The window can be dragged by its titlebar.
 *
 * This is the test #33 was opened for. The unit tests assert that
 * `data-tauri-drag-region` is in the DOM, which stayed true through the whole
 * of #30 — where the attribute was there, the permission was not, and the
 * window could not be moved at all.
 *
 * So the DOM only says *where* to press. What is asserted is the window's own
 * rect, read from Windows, after a real mouse has dragged it.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FRAME, launchApp, toScreen, type LaunchedApp } from "./support/app";
import { dragMouse, waitFor } from "./support/win32";

/** Far enough that no amount of snapping or rounding could account for it. */
const DRAG = { x: 90, y: 60 };

describe("dragging the window by its titlebar", () => {
  let app: LaunchedApp;

  beforeAll(async () => {
    app = await launchApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("moves the window by as much as the mouse moved", async () => {
    // Read in one round trip, because the ratio is what the rect has to be
    // read in: a scale factor that changed between the two would aim the drag
    // at a row of pixels that is not the titlebar.
    const bar = await app.browser.execute((selector: string) => {
      const element = document.querySelector(selector);
      const { x, y, width, height } = element!.getBoundingClientRect();
      return { x, y, width, height, devicePixelRatio: window.devicePixelRatio };
    }, FRAME);

    const before = app.window();

    // A quarter of the way along: the drag region is `deep` and so covers the
    // whole bar, but the right-hand third of it is the minimize and close
    // buttons, and Tauri stops at the first clickable element it meets.
    const grip = toScreen(
      before,
      { x: bar.x + bar.width * 0.25, y: bar.y + bar.height / 2 },
      bar.devicePixelRatio,
    );

    dragMouse(grip, { x: grip.x + DRAG.x, y: grip.y + DRAG.y }, before.handle);

    // The move loop finishes on its own time, after the button comes up.
    const moved = await waitFor("the window to move", () => {
      const now = app.window();
      return now.x !== before.x || now.y !== before.y ? now : null;
    });

    // Within a few pixels: Windows may nudge a window off a screen edge, and
    // the cursor is placed in physical pixels that a fractional scale factor
    // rounds. The failure this guards against is zero movement, not two.
    expect(moved.x - before.x).toBeCloseTo(DRAG.x, -1);
    expect(moved.y - before.y).toBeCloseTo(DRAG.y, -1);

    // The window moved; it did not resize. A drag that turned into a resize
    // would mean the grip landed on the invisible frame rather than the bar.
    expect(moved.width).toBe(before.width);
    expect(moved.height).toBe(before.height);
  });
});
