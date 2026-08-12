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
  /**
   * When the pause in progress began, or `null` while running.
   *
   * `startAt` is never moved to account for a pause — it is what the logged
   * entry reports as the moment work began (ADR-0011) — so elapsed time is
   * measured to here instead of to now.
   */
  pausedAt: Instant | null;
  /** Every pause already finished, totalled in seconds. */
  pausedSeconds: number;
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

/** The presets a report offers, plus the range someone picks by hand. */
export type PresetName = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth";

/**
 * Which stretch of days a report is about.
 *
 * A preset is a name, not a range: Rust resolves it against today, so "last
 * week" means the same Monday-to-Sunday here as it does in the export, and no
 * ISO rule is re-implemented in JavaScript.
 */
export type Period = { preset: PresetName } | ({ preset: "custom" } & DateRange);

/**
 * An ISO week number and the ISO year it belongs to — not always the calendar
 * year: the week of 28 December 2026 runs into January and is still 2026/53.
 */
export interface IsoWeek {
  year: number;
  week: number;
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
  /** The week the range is, when it is a whole one. `null` for a month. */
  isoWeek: IsoWeek | null;
  totalMinutes: number;
  rows: Row[];
}

/**
 * The column headings the exported sheet is written with.
 *
 * They travel from here into Rust because UI copy lives in the catalogues — a
 * heading spelled in Rust would be a hardcoded string the lint cannot see.
 */
export interface SheetLabels {
  sheetName: string;
  date: string;
  client: string;
  project: string;
  note: string;
  hours: string;
  total: string;
}

/**
 * What the tray icon shows, in the language the app is currently in.
 *
 * Like `SheetLabels`, the words travel into Rust rather than living there: UI
 * copy belongs in the catalogues, and a menu item spelled in Rust would be a
 * hardcoded string the lint cannot see.
 */
export interface TrayLabels {
  show: string;
  /** "Start timer" or "Stop timer" — only the UI knows which applies. */
  toggle: string;
  quit: string;
  /** What hovering says, which while a block runs is the time left in it. */
  tooltip: string;
}

export interface Settings {
  theme: ThemeName;
  /** When set, the OS light/dark preference wins over `theme`. */
  followSystem: boolean;
  language: Language;
  pomodoroMinutes: number;
  breakMinutes: number;
  /** The soft chime at the edge of a block. */
  chimeEnabled: boolean;
  /** Whether ending a block also raises a Windows notification. */
  notificationsEnabled: boolean;
  /** Whether TimeBuddy registers itself to start with Windows. */
  autostart: boolean;
  /** Where backups go. `null` means the app's own data directory. */
  backupFolder: string | null;
  updatedAt: Instant;
}

/**
 * Whether the hours are safe, read off the backup folder.
 *
 * There is no `lastBackupAt` column behind this — the newest file's own name is
 * when the last backup succeeded, so a row and a folder can never end up
 * disagreeing (ADR-0007). Every field describes the same single read.
 */
export interface BackupStatus {
  /** The resolved folder, so the screen can say where to go and look. */
  folder: string;
  /** When the newest backup was made. `null` when there are none. */
  lastBackupAt: Instant | null;
  /** How many backups are in the folder, at most seven. */
  kept: number;
  /** No backup has been made today, so one is owed. */
  due: boolean;
  /** The newest backup is old enough to be worth warning about. */
  stale: boolean;
}

/**
 * A backup offered as something to go back to (ADR-0008).
 *
 * `fileName` is the handle every restore command takes — never a path. Only
 * names matching a backup's own pattern can be staged, which is what keeps an
 * arbitrary file on disk off this list.
 */
export interface RestorableBackup {
  fileName: string;
  madeAt: Instant;
}

/**
 * What restoring a particular backup would cost, said in what is lost.
 *
 * Counted in the database as it stands: entries logged *since* the backup was
 * made are the ones the restore discards.
 */
export interface RestorePreview {
  fileName: string;
  madeAt: Instant;
  entriesSince: number;
  minutesSince: number;
}

/** Why a staged restore did not happen. */
export type RestoreFault =
  /** The staged file no longer verified — a synced folder can rot overnight. */
  | "stagedFileRejected"
  /** The present could not be copied aside, so nothing was swapped. */
  | "safetyCopyFailed"
  /** The files themselves could not be moved. */
  | "swapFailed";

/**
 * What this launch did about a staged restore.
 *
 * Asked once, by the shell. A `failed` is announced rather than passed over:
 * opening on old data in silence would read as the restore having worked.
 */
export type RestoreOutcome =
  | { status: "nothing" }
  | {
      status: "done";
      restoredFrom: Instant;
      /** Where the present went. `null` when there was none to copy aside. */
      safetyCopy: string | null;
    }
  | { status: "failed"; fault: RestoreFault };

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
  | "timerAlreadyRunning"
  | "passwordTooShort"
  | "recoveryPhraseTooShort"
  | "accountAlreadyExists"
  | "wrongPassword"
  | "wrongRecoveryPhrase"
  /** The chosen backup is not a database we can open — truncated, or not one. */
  | "backupUnreadable"
  /** The chosen backup has a newer schema than this build knows. */
  | "backupFromNewerVersion"
  /** A file was offered for restore that this app did not write. */
  | "notABackup";

/** What a rejected command rejects with. */
export type CommandError =
  | { kind: "validation"; code: ValidationCode }
  | { kind: "notFound"; entity: string; id: number }
  | { kind: "database"; message: string }
  /** The file could not be written. The hours are safe; the file is not there. */
  | { kind: "export"; message: string }
  /** A backup could not be written. The one failure nobody asked to hear about
   * and everybody needs to. */
  | { kind: "backup"; message: string }
  /** Windows refused the startup entry. The one setting that lives outside
   * the database, so it is the one that can fail on its own. */
  | { kind: "autostart"; message: string }
  /** No tray icon could be made. Close then has nowhere to hide the window. */
  | { kind: "tray"; message: string }
  /** Argon2 itself failed. Not a wrong password — a fault. */
  | { kind: "hashing"; message: string }
  /** A backup could not be staged. Nothing was written over — the database on
   * screen is still the one they have. */
  | { kind: "restore"; message: string };

/**
 * Narrows an unknown rejection to a `CommandError`. Anything else — a dropped
 * IPC channel, a panic — is not something the UI can translate.
 */
export function isCommandError(error: unknown): error is CommandError {
  if (typeof error !== "object" || error === null || !("kind" in error)) {
    return false;
  }
  const { kind } = error as { kind: unknown };
  return (
    kind === "validation" ||
    kind === "notFound" ||
    kind === "database" ||
    kind === "export" ||
    kind === "backup" ||
    kind === "autostart" ||
    kind === "tray" ||
    kind === "hashing"
  );
}
