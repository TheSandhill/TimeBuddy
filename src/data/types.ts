/**
 * The shapes the Rust command layer speaks (ADR-0002).
 *
 * These mirror the `serde` representations in `src-tauri/src/*.rs`. The
 * frontend never writes SQL, so this file — not a table — is what a component
 * knows about the database.
 */

import type { ThemeName } from "../theme/tokens";
import type { Language } from "../i18n/config";

/** An RFC 3339 instant in UTC, e.g. `2026-08-05T12:00:00Z`. */
export type Instant = string;

/** A calendar day, `YYYY-MM-DD`. Dates carry no timezone: a day is a day. */
export type Day = string;

export interface Client {
  id: number;
  name: string;
  notes: string | null;
  /** Set once archived. Archived clients stay in reports, out of pickers. */
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface Project {
  id: number;
  clientId: number;
  name: string;
  /** Stored for a future billing feature; nothing in v1 reads it. */
  hourlyRate: number | null;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface ProjectFilter {
  /** `null` means every client. */
  clientId?: number | null;
  includeArchived: boolean;
}

/** How an entry came to exist. Timer entries are the only ones with times. */
export type TimeEntrySource = "manual" | "timer";

export interface TimeEntry {
  id: number;
  projectId: number;
  date: Day;
  durationMinutes: number;
  /** Populated only when `source` is `"timer"`. */
  startAt: Instant | null;
  endAt: Instant | null;
  note: string | null;
  source: TimeEntrySource;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface NewTimeEntry {
  projectId: number;
  date: Day;
  durationMinutes: number;
  note?: string | null;
  source: TimeEntrySource;
  /** Ignored unless `source` is `"timer"`. */
  startAt?: Instant | null;
  endAt?: Instant | null;
}

/**
 * The parts of an entry that can be corrected afterwards. `source`, `startAt`
 * and `endAt` are absent on purpose: they record how the entry came to exist.
 */
export interface TimeEntryEdit {
  projectId: number;
  date: Day;
  durationMinutes: number;
  note?: string | null;
}

/**
 * The at-most-one in-flight Pomodoro Block. Only its start instant is stored —
 * elapsed time is derived from the wall clock, so laptop sleep is a non-event.
 */
export interface RunningTimer {
  projectId: number;
  startAt: Instant;
  /**
   * The block's nominal length, frozen when it started. Changing the default
   * in Settings mid-block must not move the finish line of a block already
   * under way.
   */
  plannedMinutes: number;
}

/**
 * What ending a block is worth. The project and the start instant are absent
 * on purpose — Rust already holds those, and re-sending them would let the UI
 * log a block against a project it never ran on.
 */
export interface StopTimer {
  /** The day the work belongs to, in the user's own timezone. */
  date: Day;
  /** Full length for a completed block, actual elapsed for one stopped early. */
  durationMinutes: number;
  /** When the block ended — for a completed one, when it ran out. */
  endAt: Instant;
  note?: string | null;
}

export interface EntryFilter {
  /** Inclusive. `null` means unbounded. */
  from?: Day | null;
  to?: Day | null;
  projectId?: number | null;
}

/** An inclusive span of days. */
export interface DateRange {
  from: Day;
  to: Day;
}

export interface ClientTotal {
  clientId: number;
  clientName: string;
  totalMinutes: number;
}

export interface ProjectTotal {
  projectId: number;
  projectName: string;
  clientId: number;
  clientName: string;
  totalMinutes: number;
}

export interface Report<Row> {
  range: DateRange;
  totalMinutes: number;
  rows: Row[];
}

export interface Settings {
  theme: ThemeName;
  /** When set, the OS light/dark preference wins over `theme`. */
  followSystem: boolean;
  language: Language;
  pomodoroMinutes: number;
  breakMinutes: number;
  updatedAt: Instant;
}

/**
 * Why an input was rejected. A code, not a sentence — the message the user
 * reads comes from the i18n catalogues.
 */
export type ValidationCode =
  | "nameRequired"
  | "durationNotPositive"
  | "durationExceedsDay"
  | "dateInFuture"
  | "rangeEndsBeforeStart"
  | "durationSettingNotPositive"
  | "timerAlreadyRunning";

/** What a rejected command rejects with. */
export type CommandError =
  | { kind: "validation"; code: ValidationCode }
  | { kind: "notFound"; entity: string; id: number }
  | { kind: "database"; message: string };

/**
 * Narrows an unknown rejection to a `CommandError`. Anything else — a dropped
 * IPC channel, a panic — is not something the UI can translate.
 */
export function isCommandError(error: unknown): error is CommandError {
  if (typeof error !== "object" || error === null || !("kind" in error)) {
    return false;
  }
  const { kind } = error as { kind: unknown };
  return kind === "validation" || kind === "notFound" || kind === "database";
}
