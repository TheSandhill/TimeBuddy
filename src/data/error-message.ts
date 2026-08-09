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
export type ErrorKey = `error.${ValidationCode | "notFound" | "unknown"}`;

export function errorKey(error: unknown): ErrorKey {
  if (isCommandError(error)) {
    switch (error.kind) {
      case "validation":
        return `error.${error.code}`;
      case "notFound":
        return "error.notFound";
      // A database message is for a log, not for a person.
      case "database":
        return "error.unknown";
    }
  }
  return "error.unknown";
}
