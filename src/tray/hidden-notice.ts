/**
 * The one-off explanation that close did not mean quit (ADR-0004).
 *
 * A window that vanishes without a word reads as a crash, and someone who
 * thinks it crashed is someone who never looks in the tray. Once told, never
 * again: a warning about behaviour already seen is only a thing to dismiss.
 *
 * It is a Windows notification rather than a banner in the app, for the
 * obvious reason — the window it would have appeared in has just gone.
 */

import { notify } from "../timer/notify";

/**
 * Remembers that the explanation has been given.
 *
 * `localStorage` rather than the settings row: Settings is edited on one
 * screen and saved as a unit (`CONTEXT.md`), and "has been told once" is not a
 * preference — it belongs on neither that screen nor in that one Save.
 */
const EXPLAINED_KEY = "timebuddy.tray.explained";

function alreadyExplained(): boolean {
  try {
    return window.localStorage.getItem(EXPLAINED_KEY) === "yes";
  } catch {
    // A webview with storage switched off. Explaining twice is a smaller
    // failure than never explaining at all.
    return false;
  }
}

function rememberExplained(): void {
  try {
    window.localStorage.setItem(EXPLAINED_KEY, "yes");
  } catch {
    // As above.
  }
}

export interface TrayNotice {
  title: string;
  body: string;
}

/** Says it the first time the window goes into the tray, and only then. */
export async function explainHiddenToTray(notice: TrayNotice): Promise<void> {
  if (alreadyExplained()) {
    return;
  }
  rememberExplained();
  await notify(notice.title, notice.body);
}
