/**
 * The window, asked of Windows rather than of the app.
 *
 * Everything here goes through `win32.ps1`. Nothing in it consults TimeBuddy:
 * an assertion that the app *says* it moved is the same kind of assertion #33
 * was opened about. These read the window the way another program would.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./win32.ps1", import.meta.url));

/** A top-level window as Windows describes it. Physical pixels throughout. */
export interface NativeWindow {
  handle: number;
  processId: number;
  visible: boolean;
  /** The window rect — what "did it move" is measured against. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The client area's screen origin — what a webview coordinate is added to. */
  clientX: number;
  clientY: number;
}

function powershell(args: string[]): string {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...args],
    { encoding: "utf8", windowsHide: true },
  ).trim();
}

/**
 * Every top-level window of every copy of the app, and the ids running them.
 *
 * Deliberately unfiltered. The developer running this suite has their own
 * TimeBuddy in the tray, and a helper that returned "the" window would return
 * theirs about half the time — so the caller says which process is its own.
 *
 * A process with no window and no process at all are different answers, and
 * the tray test is exactly the one that turns on telling them apart.
 */
export function listWindows(processName = "TimeBuddy"): {
  processIds: number[];
  windows: NativeWindow[];
} {
  const output = powershell(["-Action", "find", "-ProcessName", processName]);
  return JSON.parse(output) as { processIds: number[]; windows: NativeWindow[] };
}

/**
 * Presses, moves and releases the real mouse. Physical screen pixels.
 *
 * `handle` is the window the press is meant for: it is raised first, and the
 * drag refuses rather than proceeding if something else is on top of that
 * point. A real mouse presses whatever is there.
 */
export function dragMouse(
  from: { x: number; y: number },
  to: { x: number; y: number },
  handle: number,
): void {
  powershell([
    "-Action",
    "drag",
    "-Handle",
    String(handle),
    "-FromX",
    String(Math.round(from.x)),
    "-FromY",
    String(Math.round(from.y)),
    "-ToX",
    String(Math.round(to.x)),
    "-ToY",
    String(Math.round(to.y)),
  ]);
}

/** Something read either straight away or a round trip later. */
type Awaitable<T> = T | Promise<T>;

/**
 * Polls until `read` returns something truthy, or gives up saying what it
 * wanted.
 *
 * The reading may be asynchronous — some of what is waited for is behind
 * WebDriver — and is awaited before it is judged. A promise is truthy, so a
 * condition that was merely returned rather than awaited would be met on the
 * first attempt whatever it said.
 */
export async function waitFor<T>(
  what: string,
  read: () => Awaitable<T | null | undefined | false>,
  { timeout = 10_000, interval = 250 } = {},
): Promise<T> {
  const deadline = Date.now() + timeout;

  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
