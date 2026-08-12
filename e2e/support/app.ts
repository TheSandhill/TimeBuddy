/**
 * One launched copy of TimeBuddy, with a WebDriver attached to its webview.
 *
 * The app is started here rather than by tauri-driver, and the port it is
 * reached on is baked into an e2e-only build. Why, at length, in ADR-0012.
 *
 * Two more things are this file's rather than each test's:
 *
 * 1. **The data.** The app resolves its database under `%APPDATA%`, so a suite
 *    that ran as the developer would run against their real hours. What buys
 *    the isolation is the e2e build's own bundle identifier, and every launch
 *    empties the directories that hang off it.
 * 2. **Which process is ours.** The developer's own TimeBuddy is in their tray
 *    while they work on this, so every native question is asked about the pid
 *    this file started and no other.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { remote, type Browser } from "webdriverio";

import { listWindows, waitFor, type NativeWindow } from "./win32";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The binary under test. Built by `npm run e2e:build`, which is a release
 * build plus the debugging port — the suite refuses rather than guessing,
 * because an e2e run against a stale binary is worse than one that did not
 * run.
 */
export const APP_BINARY = join(REPO, "src-tauri", "target", "release", "TimeBuddy.exe");

/** How `Get-Process` and `taskkill` both name it. */
const PROCESS_NAME = "TimeBuddy";

/**
 * The bundle identifier the e2e build carries, read from the overlay that
 * gives it rather than repeated here — two copies of this string are two
 * directories, and the one that gets emptied would sooner or later be the one
 * nothing is written to.
 */
const E2E_IDENTIFIER = (
  JSON.parse(
    readFileSync(join(REPO, "src-tauri", "tauri.e2e.conf.json"), "utf8"),
  ) as { identifier?: string }
).identifier;

/**
 * Throws away everything the last launch left behind, so this one is an
 * install that has never been run: no database, no account, no settings.
 *
 * Not done by pointing `%APPDATA%` at a temporary directory, which is the
 * obvious thing and does not work. Tauri resolves the app's data directory
 * with `SHGetKnownFolderPath`, and so does the WebView2 loader for its user
 * data folder — neither reads the environment, so a launch given a scratch
 * `%APPDATA%` opens the developer's real hours regardless and says nothing
 * about it.
 *
 * What can be moved is the identifier those paths are built from, and
 * `tauri.e2e.conf.json` moves it. Which makes these two directories the e2e
 * build's alone, and emptying them safe: nothing but this suite has ever
 * written to them. A Rust test fails if the identifiers are ever the same
 * again.
 *
 * The WebView2 folder matters for its own reason. Two hosts sharing one share
 * the browser process behind it, so a launch that joined a browser started
 * without the debugging port would never open one — an app that looks for all
 * the world like it ignored its own config.
 */
function emptyAppData() {
  if (!E2E_IDENTIFIER) {
    throw new Error("tauri.e2e.conf.json names no identifier of its own — see lib.rs");
  }

  for (const variable of ["APPDATA", "LOCALAPPDATA"]) {
    const root = process.env[variable];
    if (!root) throw new Error(`no %${variable}% to clear the e2e data out of`);
    rmSync(join(root, E2E_IDENTIFIER), { recursive: true, force: true });
  }
}

/**
 * The titlebar, which is the window's own chrome (ADR-0004) and the one
 * element every test in this suite starts from — to press, or to know the app
 * has finished rendering.
 */
export const FRAME = "[data-tauri-drag-region]";

/**
 * The port `tauri.e2e.conf.json` tells the webview to listen on.
 *
 * Fixed rather than negotiated, because it is baked into the binary at build
 * time. Which is also why the suite runs one file at a time.
 */
const DEBUG_PORT = 9222;

/** Where the WebDriver answers. Fixed for the same reason: one file at a time. */
const DRIVER_PORT = 4444;

/** Where msedgedriver is, if it is not simply on the PATH. */
const NATIVE_DRIVER = process.env.MSEDGEDRIVER ?? "msedgedriver.exe";

export interface LaunchedApp {
  browser: Browser;
  /** The copy this launch started, and only that one. */
  processId: number;
  /** The window as Windows currently sees it. Re-read on every call. */
  window(): NativeWindow;
  /** Whether the launched copy is still running, window or no window. */
  alive(): boolean;
  close(): Promise<void>;
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitUntilListening(port: number, what: string, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (!(await listening(port))) {
    if (Date.now() > deadline) throw new Error(`${what} never listened on ${port}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** The page the app serves itself from. Anything else is not the app. */
const APP_URL = "http://tauri.localhost/";

/**
 * Waits until the app's own page exists, and answers what is there instead.
 *
 * A webview that is listening is not yet a webview showing the app: WebView2
 * opens with a blank target and creates the page a moment later. Attaching in
 * that moment binds the session to the blank one for good — the app renders,
 * and the driver goes on looking at `about:blank` until every selector has
 * timed out. That is a slow machine's failure, so it appears in CI and not on
 * the desk of whoever wrote the test.
 */
async function waitForAppPage(timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  let seen = "nothing at all";

  for (;;) {
    try {
      const targets = (await (
        await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      ).json()) as { type: string; url: string }[];

      if (targets.some((target) => target.url.startsWith(APP_URL))) return;
      seen = targets.map((target) => `${target.type} ${target.url}`).join(", ");
    } catch {
      // The port is up but the endpoint is not answering yet.
    }

    if (Date.now() > deadline) {
      throw new Error(`the app never opened ${APP_URL} — the webview has ${seen}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * Puts the app back in the webview the session just blanked.
 *
 * Starting a session navigates the page it attached to — the same CDP target
 * comes back `about:blank`, app and all. Whether that matters was a race, and
 * the race was being won: attach before the app has loaded and it loads
 * afterwards over the top; attach after, and the app is what gets thrown away.
 * A slower machine picks the second, which is why CI failed on a suite that
 * had passed here a dozen times.
 *
 * So the page is navigated back deliberately rather than hoped for. The app
 * reloads from nothing, which is the state these tests wanted anyway.
 */
async function reloadApp(browser: Browser): Promise<void> {
  await browser.url(APP_URL);

  const url = await browser.getUrl();
  if (!url.startsWith(APP_URL)) {
    throw new Error(`the webview is showing ${url} rather than ${APP_URL}`);
  }
}

/**
 * Kills a process and everything it started.
 *
 * `/T` is the point: the webview runs in processes of its own, and a killed
 * app that left them behind would leave the debugging port bound — which the
 * next test file would then attach to and drive a dead window through.
 *
 * Not in `win32.ps1` with the rest of the Windows calls: that script answers
 * questions about a window, and this is the lifecycle of a process this file
 * started and therefore owns.
 */
function killTree(processId: number) {
  try {
    execFileSync("taskkill", ["/PID", String(processId), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // Already gone, which is the outcome this wanted.
  }
}

/**
 * Starts the app, attaches a driver to it, and waits until its frame is up.
 *
 * Waiting is part of launching rather than each test's first two lines: an app
 * whose titlebar has not rendered is not one any of these tests can ask
 * anything of, and every one of them would otherwise open the same way.
 */
export async function launchApp(): Promise<LaunchedApp> {
  if (!existsSync(APP_BINARY)) {
    throw new Error(`no built app at ${APP_BINARY} — run \`npm run e2e:build\` first`);
  }

  if (await listening(DEBUG_PORT)) {
    throw new Error(
      `something is already listening on ${DEBUG_PORT} — a previous e2e app that outlived its test, or a browser started with the same debugging port`,
    );
  }

  // An install that has never been run, which is the state these tests want:
  // the titlebar and the tray are there from the first frame, in front of the
  // first-run wizard.
  emptyAppData();

  const app: ChildProcess = spawn(APP_BINARY, [], {
    stdio: "ignore",
    windowsHide: false,
  });
  const processId = app.pid!;

  // No `shell: true`: that would put a cmd.exe between here and the driver,
  // and `kill()` would then end the shell and leave msedgedriver holding its
  // port — which is the sort of leak that only shows up as the *next* file
  // failing.
  const driver: ChildProcess = spawn(NATIVE_DRIVER, [`--port=${DRIVER_PORT}`], {
    stdio: "ignore",
    windowsHide: true,
  });

  let browser: Browser | undefined;

  const shutdown = async () => {
    if (browser) await browser.deleteSession().catch(() => {});
    killTree(processId);
    driver.kill();

    // The port is the one thing the next file cannot start without, and a
    // killed process gives it up on Windows' schedule rather than on ours.
    const deadline = Date.now() + 10_000;
    while ((await listening(DEBUG_PORT)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };

  try {
    // The app's own page before the driver, not merely the port: attaching to
    // a webview that has not put the app in it yet binds the session to a
    // blank page it never leaves.
    await waitUntilListening(DEBUG_PORT, "the app's webview");
    await waitForAppPage();
    await waitUntilListening(DRIVER_PORT, "msedgedriver");

    browser = await remote({
      hostname: "127.0.0.1",
      port: DRIVER_PORT,
      capabilities: {
        browserName: "MicrosoftEdge",
        "ms:edgeOptions": { debuggerAddress: `127.0.0.1:${DEBUG_PORT}` },
      } as WebdriverIO.Capabilities,
      logLevel: "error",
      connectionRetryCount: 1,
    });

    await waitFor(
      "the app window to appear",
      () => listWindows(PROCESS_NAME).windows.find((w) => w.processId === processId),
      { timeout: 30_000 },
    );

    await reloadApp(browser);

    // The frame, not a screen: it is what every test presses or reads, and it
    // is up behind the lock screen as much as behind an unlocked app.
    await browser.$(FRAME).waitForDisplayed({ timeout: 30_000 });

    return {
      browser,
      processId,
      window() {
        const window = listWindows(PROCESS_NAME).windows.find(
          (w) => w.processId === processId,
        );
        if (!window) throw new Error("the app has no top-level window");
        return window;
      },
      alive() {
        return listWindows(PROCESS_NAME).processIds.includes(processId);
      },
      close: shutdown,
    };
  } catch (error) {
    await shutdown();
    throw error;
  }
}

/**
 * Where a point in the webview lands on the screen.
 *
 * The webview reports CSS pixels against its own client area; Windows takes
 * physical pixels against the desktop. One function rather than a line in each
 * test, because getting either half wrong aims a drag at nothing.
 */
export function toScreen(
  window: NativeWindow,
  point: { x: number; y: number },
  devicePixelRatio: number,
): { x: number; y: number } {
  return {
    x: Math.round(window.clientX + point.x * devicePixelRatio),
    y: Math.round(window.clientY + point.y * devicePixelRatio),
  };
}
