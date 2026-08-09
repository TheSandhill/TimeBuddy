/**
 * The one place a rejection becomes something to read.
 *
 * Rust rejects with a code, never a sentence (`types.ts`), and the frontend's
 * own duration parser uses the same vocabulary. Both end up here so a rule and
 * its wording stay one step apart.
 */

import { isCommandError, type ValidationCode } from "./types";
import type { DurationProblem } from "../entries/duration";

/**
 * An i18n key under `error.`. Spelled as a template type so a code that has no
 * translation is a compile error rather than a key shown to the user.
 */
export type ErrorKey = `error.${ValidationCode | DurationProblem | "notFound" | "unknown"}`;

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

export function durationErrorKey(problem: DurationProblem): ErrorKey {
  return `error.${problem}`;
}
