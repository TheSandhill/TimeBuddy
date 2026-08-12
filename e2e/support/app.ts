/**
 * One launched copy of TimeBuddy, with a WebDriver attached to its webview.
 *
 * The app is started here rather than by tauri-driver, and the port it is
 * reached on is baked into an e2e-only build. Why, at length, in ADR-0012.
 *
 * Two more things are this file's rather than each test's:
 *
 * 1. **The data.** The app resolves its database under `%APPDATA%`, so a suite
 *    that inherited the developer's environment would run against their real
 *    hours. Every launch gets an empty directory and throws it away after.
 * 2. **Which process is ours.** The developer's own TimeBuddy is in their tray
 *    while they work on this, so every native question is asked about the pid
 *    this file started and no other.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

  // An empty %APPDATA% is an app that has never been run: no database, no
  // account, no settings. Which is the state these tests want — the titlebar
  // and the tray are there from the first frame, behind the lock screen.
  //
  // %LOCALAPPDATA% goes with it for a second reason: WebView2 keeps its user
  // data folder there, and two hosts sharing one share the browser process
  // behind it. A launch that joined a browser started without the debugging
  // port would never open one, and would look for all the world like an app
  // that simply ignored its own config.
  const dataDir = mkdtempSync(join(tmpdir(), "timebuddy-e2e-"));

  const app: ChildProcess = spawn(APP_BINARY, [], {
    stdio: "ignore",
    windowsHide: false,
    env: { ...process.env, APPDATA: dataDir, LOCALAPPDATA: dataDir },
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
    rmSync(dataDir, { recursive: true, force: true });
  };

  try {
    // The window before the driver: attaching to a webview that has not been
    // created yet is the failure this whole file exists because of.
    await waitUntilListening(DEBUG_PORT, "the app's webview");
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
