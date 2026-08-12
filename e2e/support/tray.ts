/**
 * The tray icon, asked of Windows rather than of the app.
 *
 * `win32.ts` is the same idea for the window. This is its counterpart for the
 * one part of TimeBuddy that is not a window at all: an icon explorer draws,
 * and a menu the app opens with `TrackPopupMenu`. Everything here goes through
 * `tray.ps1`, which explains at length why it needs UI Automation to get
 * there (ADR-0013).
 *
 * Nothing in it consults TimeBuddy. The tooltip that comes back is the one
 * Windows is showing and the labels are the ones in the `HMENU`, not what the
 * frontend believes it sent.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./tray.ps1", import.meta.url));

/** A notification-area icon as Windows describes it. Physical pixels. */
export interface TrayIcon {
  /**
   * The UI Automation runtime id — how the same icon is found again later.
   *
   * Not the tooltip, which is the thing under test: a running block's icon
   * says "Nog 24 min" and nothing about TimeBuddy, so an icon looked up by
   * name would go missing exactly when it mattered.
   */
  runtimeId: string;
  /** The tooltip, which is what a `Shell_NotifyIcon` puts in the UIA name. */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One line of the menu the icon opens, and where a click on it lands. */
export interface TrayMenuItem {
  name: string;
  x: number;
  y: number;
}

/**
 * The menu TimeBuddy builds, in the order `tray.rs` adds the items.
 *
 * Positions rather than labels, like the titlebar buttons in
 * `close-hides-to-tray`: the words come from the catalogues and a reworded
 * Dutch string is not a regression, but the order is a decision (ADR-0004).
 */
export const SHOW_ITEM = 0;
export const TOGGLE_ITEM = 1;
export const QUIT_ITEM = 2;

function powershell(args: string[]): string {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...args],
    { encoding: "utf8", windowsHide: true },
  ).trim();
}

/**
 * Whether this session has a notification area at all.
 *
 * Asked before anything is launched, because it decides whether the question
 * these tests ask can be put. A runner with no desktop, or a machine sitting
 * at its lock screen, has no shell to press — which is not the same answer as
 * a tray menu that does not work, and must not be reported as one.
 */
export function hasNotificationArea(): boolean {
  const output = powershell(["-Action", "probe"]);
  return (JSON.parse(output) as { notificationArea: boolean }).notificationArea;
}

/**
 * Every notification-area icon whose tooltip matches, and whether there was a
 * notification area to look in at all.
 *
 * The second half is not pedantry. A session with no shell — a headless CI
 * runner, a machine at the lock screen — cannot answer any question this
 * harness asks, and a tray menu that could not be reached is not a tray menu
 * that is broken. The caller is left to tell those apart rather than being
 * handed an empty list that means either.
 *
 * Unfiltered, for the reason `listWindows` is: a developer running this suite
 * has their own TimeBuddy in the tray, and one of the two icons would be
 * theirs.
 */
export function findTrayIcons(match: string): {
  notificationArea: boolean;
  icons: TrayIcon[];
} {
  const output = powershell(["-Action", "find", "-Match", match]);
  return JSON.parse(output) as { notificationArea: boolean; icons: TrayIcon[] };
}

/** What the icon says now — the tooltip re-read, which is how it is asserted. */
export function readTrayIcon(runtimeId: string): TrayIcon {
  return JSON.parse(powershell(["-Action", "read", "-RuntimeId", runtimeId])) as TrayIcon;
}

/**
 * Right-clicks the icon and reports what the menu offers, then closes it
 * again without pressing anything.
 */
export function openTrayMenu(runtimeId: string): TrayMenuItem[] {
  const output = powershell(["-Action", "menu", "-RuntimeId", runtimeId]);
  return (JSON.parse(output) as { items: TrayMenuItem[] }).items;
}

/**
 * The same right-click, and then a real left-click on one of the items.
 *
 * Answers with the label it pressed, so a test can say which item it meant
 * and a failure names what it hit instead.
 */
export function pressTrayItem(runtimeId: string, item: number): string {
  const output = powershell([
    "-Action",
    "activate",
    "-RuntimeId",
    runtimeId,
    "-Item",
    String(item),
  ]);
  return (JSON.parse(output) as { pressed: string }).pressed;
}

/**
 * Closes a flyout or menu left open by a run that fell over.
 *
 * Every other action puts away what it opened, so this is only ever cleaning
 * up after a failure — but a popup left over the notification area fails every
 * step after it for a reason that is not its own.
 */
export function dismissTrayPopups(): void {
  try {
    powershell(["-Action", "dismiss"]);
  } catch {
    // Cleanup, and there is nothing above it to report to.
  }
}
