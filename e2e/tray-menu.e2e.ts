/**
 * The tray menu, which is the third test #33 asked for and #43 was left open
 * against.
 *
 * Every other test in this suite drives a window. This one deliberately has no
 * window to drive: the app is hidden in the tray before a single item is
 * pressed, because acting from the tray without the window coming back is the
 * whole point of the item (`CONTEXT.md`, Tray). So the window's continued
 * absence is an assertion in nearly every step here, not a setup detail.
 *
 * What is asked of Windows, through `support/tray.ts`:
 *
 * - that the icon opens a menu of four at all;
 * - that the second one starts and stops a Pomodoro Block, and that the label
 *   flips between the two as it does;
 * - that the third holds the block and lets it go again, and is greyed while
 *   there is no block to hold;
 * - that the tooltip counts the block down, which takes the minute it takes;
 * - that a block stopped from here is worth the minutes actually elapsed and
 *   not the nominal length, which is ADR-0010's claim that the lifecycle is
 *   the app's and not the Timer screen's;
 * - that Quit ends the process, being the one way out (ADR-0004).
 *
 * The steps run in order and share one launch. A file per assertion would be a
 * release build's worth of launching for each, and — more to the point — the
 * block started in one step is the block stopped in the next.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FRAME, launchApp, type LaunchedApp } from "./support/app";
import { completeFirstRun } from "./support/first-run";
import {
  dismissTrayPopups,
  findTrayIcons,
  hasNotificationArea,
  openTrayMenu,
  PAUSE_ITEM,
  pressTrayItem,
  QUIT_ITEM,
  readTrayIcon,
  SHOW_ITEM,
  TOGGLE_ITEM,
  type TrayIcon,
} from "./support/tray";
import { waitFor } from "./support/win32";

/** The work the wizard is told to create, so the tray has something to start. */
const CLIENT = "E2E Client";
const PROJECT = "E2E Project";

/**
 * A tooltip is the app name while nothing runs and a count of minutes while
 * something does, so the minutes are what is read out of it.
 */
function minutesIn(tooltip: string): number {
  const digits = tooltip.match(/\d+/);
  if (!digits) throw new Error(`no minutes in the tray tooltip "${tooltip}"`);
  return Number(digits[0]);
}

/**
 * A skip rather than a failure, and only for this: a session with no
 * notification area cannot be asked whether the tray menu works. Everything
 * else here fails loudly, including a notification area with no TimeBuddy in
 * it — that one is the app, and it is exactly what this file is for.
 */
const shell = hasNotificationArea();
if (!shell) {
  console.warn("no notification area in this session — the tray menu is not covered by this run");
}

describe.skipIf(!shell)("the tray menu", () => {
  let app: LaunchedApp;
  let icon: TrayIcon;
  /** What the icon says with nothing running, which is the app's own name. */
  let idle: string;
  /** The Start/Stop item's two labels, learnt rather than spelled out. */
  let startLabel: string;
  let stopLabel: string;
  /** The Pause item's, learnt the same way. */
  let pauseLabel: string;

  beforeAll(async () => {
    app = await launchApp();

    // The tray's Start does nothing on an install with no Projects, and
    // rightly — there would be nothing to start a block on.
    await completeFirstRun(app.browser, { client: CLIENT, project: PROJECT });

    const found = findTrayIcons("^TimeBuddy$");
    if (found.icons.length !== 1) {
      throw new Error(
        `expected one TimeBuddy tray icon, found ${found.icons.length} — quit your own copy of the app before running this`,
      );
    }
    icon = found.icons[0];
    idle = icon.name;

    // Into the tray, by the button `close-hides-to-tray` already proves hides
    // it. From here on the window is gone, and every step says so again.
    await app.browser.$(`${FRAME} button:last-of-type`).click();
    await waitFor("the window to be hidden", () => !app.window().visible || null);
  });

  afterAll(async () => {
    // Before the app goes, so a menu left open by a failure does not outlive
    // the run on somebody's desktop.
    dismissTrayPopups();
    await app?.close();
  });

  it("offers Show, Start, Pause and Quit on a right-click", () => {
    const items = openTrayMenu(icon.runtimeId);

    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.name).not.toBe("");
    }

    // Read by position, not by label: the words come from the catalogues and a
    // reworded Dutch string is not a regression. What the second one says now
    // is what the next step expects it to stop saying.
    startLabel = items[TOGGLE_ITEM].name;
    pauseLabel = items[PAUSE_ITEM].name;

    // Nothing is running, so there is nothing to hold. Greyed rather than gone:
    // Quit does not move about, and an item that answers a click by doing
    // nothing reads as a bug.
    expect(items[PAUSE_ITEM].enabled).toBe(false);
    expect(items[TOGGLE_ITEM].enabled).toBe(true);

    // Opening the menu is not showing the app.
    expect(app.window().visible).toBe(false);
  });

  it("starts a block from the menu, leaving the window in the tray", async () => {
    expect(pressTrayItem(icon.runtimeId, TOGGLE_ITEM)).toBe(startLabel);

    const running = await waitFor(
      "the tooltip to report a running block",
      () => {
        const now = readTrayIcon(icon.runtimeId);
        return now.name === idle ? null : now;
      },
      { timeout: 30_000, interval: 1_000 },
    );

    expect(minutesIn(running.name)).toBeGreaterThan(0);

    // The item is the app's answer to itself: the window has not come back, so
    // the label and the tooltip are the only report there is.
    expect(app.window().visible).toBe(false);

    const items = openTrayMenu(icon.runtimeId);
    stopLabel = items[TOGGLE_ITEM].name;
    expect(stopLabel).not.toBe(startLabel);

    // And now there is something to hold.
    expect(items[PAUSE_ITEM].enabled).toBe(true);
    expect(items[PAUSE_ITEM].name).toBe(pauseLabel);
  });

  it("counts the block down in the tooltip", async () => {
    const started = minutesIn(readTrayIcon(icon.runtimeId).name);

    // A minute, because that is what a minute costs. The tooltip counts in
    // whole minutes on purpose (`use-tray.ts`), so there is nothing shorter
    // to wait for and no length of block that would make this quicker.
    const later = await waitFor(
      "the tooltip to lose a minute",
      () => {
        const minutes = minutesIn(readTrayIcon(icon.runtimeId).name);
        return minutes < started ? minutes : null;
      },
      { timeout: 100_000, interval: 5_000 },
    );

    expect(later).toBe(started - 1);
    expect(app.window().visible).toBe(false);
  }, 120_000);

  it("holds the block from the menu, and lets it go again", async () => {
    const running = readTrayIcon(icon.runtimeId).name;

    expect(pressTrayItem(icon.runtimeId, PAUSE_ITEM)).toBe(pauseLabel);

    // The tooltip is the report, because there is no window to be one. It says
    // *paused* rather than showing a countdown that has stopped moving
    // (`CONTEXT.md`, Pomodoro Block), so the words change and the minutes stay.
    const paused = await waitFor(
      "the tooltip to say the block is held",
      () => {
        const now = readTrayIcon(icon.runtimeId).name;
        return now === running ? null : now;
      },
      { timeout: 30_000, interval: 1_000 },
    );
    expect(paused).not.toBe(idle);
    expect(minutesIn(paused)).toBe(minutesIn(running));

    // The item is the other half of the report: it now offers the way back.
    const resumeLabel = openTrayMenu(icon.runtimeId)[PAUSE_ITEM].name;
    expect(resumeLabel).not.toBe(pauseLabel);
    expect(app.window().visible).toBe(false);

    // How long a held block stays held is `timer.test.tsx`'s question, and one
    // it answers in fake time. What is only answerable here is that the menu
    // item reaches the block at all — so the block is let go again and the next
    // step stops it, rather than a minute being spent watching it not move.
    expect(pressTrayItem(icon.runtimeId, PAUSE_ITEM)).toBe(resumeLabel);
    await waitFor(
      "the tooltip to go back to counting down",
      () => readTrayIcon(icon.runtimeId).name !== paused || null,
      { timeout: 30_000, interval: 1_000 },
    );

    expect(app.window().visible).toBe(false);
  });

  it("stops the block from the menu, and logs the minutes actually worked", async () => {
    expect(pressTrayItem(icon.runtimeId, TOGGLE_ITEM)).toBe(stopLabel);

    await waitFor(
      "the tooltip to go back to saying nothing is running",
      () => readTrayIcon(icon.runtimeId).name === idle || null,
      { timeout: 30_000, interval: 1_000 },
    );

    expect(app.window().visible).toBe(false);

    // Stopping is deferred five seconds, not undone afterwards (`CONTEXT.md`,
    // Pomodoro Block), so the row is written a moment after the icon says the
    // block is over.
    expect(pressTrayItem(icon.runtimeId, SHOW_ITEM)).not.toBe("");
    const window = await waitFor("the window to come back", () =>
      app.window().visible ? app.window() : null,
    );
    expect(window.visible).toBe(true);

    // The one place in this file the DOM is read rather than pressed. What the
    // tray click reached is already proven natively — the icon changed twice
    // and the window never moved — and what a block is *worth* is the app's
    // own record, which has nowhere else to be read from.
    const entry = await waitFor(
      "today's hours to show the block",
      async () => {
        const rows = await app.browser.$$("li").getElements();
        return rows.length === 1 ? await rows[0].getText() : null;
      },
      { timeout: 30_000, interval: 1_000 },
    );

    expect(entry).toContain(PROJECT);

    // What it is worth: an early stop logs the elapsed time and never the
    // nominal length, so a block waited out for a minute and a bit logs one or
    // two minutes — and nothing like the 25 a completed one would claim
    // (ADR-0010). The held stretch is not in it either (ADR-0011).
    const logged = entry.match(/(\d+)\s*min/);
    expect(logged).not.toBeNull();
    expect(Number(logged![1])).toBeGreaterThanOrEqual(1);
    expect(Number(logged![1])).toBeLessThanOrEqual(2);

    // The clock window, which is not a catalogue string. It may span *longer*
    // than the minutes logged, because this block was held partway through and
    // `start_at` is never moved to account for one — the window describes and
    // the duration is what counts (ADR-0011).
    const window24h = entry.match(/(\d{2}):(\d{2})[^\d]+(\d{2}):(\d{2})/);
    expect(window24h).not.toBeNull();

    const [, fromHour, fromMinute, toHour, toMinute] = window24h!;
    const spanned =
      (Number(toHour) * 60 + Number(toMinute)) -
      (Number(fromHour) * 60 + Number(fromMinute));
    expect(spanned).toBeGreaterThanOrEqual(Number(logged![1]));
  });

  it("quits the app, which nothing else can do", async () => {
    expect(pressTrayItem(icon.runtimeId, QUIT_ITEM)).not.toBe("");

    await waitFor("the app to exit", () => !app.alive() || null, {
      timeout: 30_000,
      interval: 1_000,
    });

    expect(app.alive()).toBe(false);
  });
});
