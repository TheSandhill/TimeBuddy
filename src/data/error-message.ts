/**
 * The one place a rejection from the command layer becomes something to read.
 *
 * Rust rejects with a code, never a sentence (`types.ts`), so the wording lives
 * in the catalogues and this maps one to the other.
 */

import { isCommandError, type ValidationCode } from "./types";

/**
 * An i18n key under `error.`. Spelled as a template type so a code that has no
 * translation is a compile error rather than a key shown to the user.
 */
export type ErrorKey = `error.${
  | ValidationCode
  | "notFound"
  | "exportFailed"
  | "autostartFailed"
  | "trayFailed"
  | "unknown"}`;

export function errorKey(error: unknown): ErrorKey {
  if (isCommandError(error)) {
    switch (error.kind) {
      case "validation":
        return `error.${error.code}`;
      case "notFound":
        return "error.notFound";
      // A failed export is worth saying out loud: the file the user just named
      // is not there, even though their hours are untouched.
      case "export":
        return "error.exportFailed";
      // Nothing was saved either, so the checkbox on screen is still true.
      case "autostart":
        return "error.autostartFailed";
      // Rarely read: the close button falls back to a real close instead, so
      // the failure shows up as behaviour before it shows up as a sentence.
      case "tray":
        return "error.trayFailed";
      // A database message is for a log, not for a person, and neither is a
      // hashing fault — both mean "something broke", not "you typed it wrong".
      case "database":
      case "hashing":
        return "error.unknown";
    }
  }
  return "error.unknown";
}
