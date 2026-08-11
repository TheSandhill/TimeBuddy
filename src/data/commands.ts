/**
 * The typed boundary to the Rust command layer.
 *
 * Every read and write in the app goes through a function here. `invoke` is
 * called in exactly one place (`call`), so no component can reach the backend
 * with an untyped string and an object of `any` (ADR-0002).
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  BackupStatus,
  Client,
  ClientTotal,
  DateRange,
  EntryFilter,
  Instant,
  NewTimeEntry,
  Period,
  Project,
  ProjectFilter,
  ProjectTotal,
  Report,
  RestorableBackup,
  RestoreOutcome,
  RestorePreview,
  RunningTimer,
  Settings,
  SheetLabels,
  StopTimer,
  TimeEntry,
  TimeEntryEdit,
  TrayLabels,
} from "./types";

/**
 * Every command the Rust side registers. Kept in sync with
 * `generate_handler!` by `commands.test.ts` — a command added on one side and
 * not the other fails the suite rather than the app.
 */
export const commandNames = [
  "account_exists",
  "create_account",
  "unlock_account",
  "resume_session",
  "reset_account_password",
  "list_clients",
  "get_client",
  "create_client",
  "update_client",
  "archive_client",
  "restore_client",
  "list_projects",
  "get_project",
  "create_project",
  "update_project",
  "archive_project",
  "restore_project",
  "list_time_entries",
  "get_time_entry",
  "create_time_entry",
  "update_time_entry",
  "delete_time_entry",
  "get_running_timer",
  "start_running_timer",
  "stop_running_timer",
  "discard_running_timer",
  "report_by_client",
  "report_by_project",
  "export_report",
  "get_settings",
  "update_settings",
  "backup_status",
  "run_backup",
  "list_restorable_backups",
  "preview_restore",
  "stage_restore",
  "cancel_restore",
  "pending_restore",
  "restore_outcome",
  "sync_tray",
] as const;

export type CommandName = (typeof commandNames)[number];

function call<Result>(
  name: CommandName,
  args?: Record<string, unknown>,
): Promise<Result> {
  return invoke<Result>(name, args);
}

// -- Account ----------------------------------------------------------------

/** Whether this install has been set up. `false` is what raises the wizard. */
export function accountExists(): Promise<boolean> {
  return call("account_exists");
}

/** First run only. Rejects if an account already exists. */
export function createAccount(
  password: string,
  recoveryPhrase: string,
): Promise<void> {
  return call("create_account", { password, recoveryPhrase });
}

/**
 * Checks the password, and hands back a "remember me" token when one was asked
 * for. The token is the only thing worth keeping — the password never is.
 */
export function unlockAccount(
  password: string,
  remember: boolean,
): Promise<string | null> {
  return call("unlock_account", { password, remember });
}

/** Whether a token from a previous launch still opens the door. */
export function resumeSession(token: string): Promise<boolean> {
  return call("resume_session", { token });
}

/** The offline reset: the recovery phrase buys a new password (ADR-0003). */
export function resetAccountPassword(
  recoveryPhrase: string,
  password: string,
): Promise<void> {
  return call("reset_account_password", { recoveryPhrase, password });
}

// -- Clients ----------------------------------------------------------------

export function listClients(includeArchived = false): Promise<Client[]> {
  return call("list_clients", { includeArchived });
}

export function getClient(id: number): Promise<Client> {
  return call("get_client", { id });
}

export function createClient(
  name: string,
  notes?: string | null,
): Promise<Client> {
  return call("create_client", { name, notes: notes ?? null });
}

export function updateClient(
  id: number,
  name: string,
  notes?: string | null,
): Promise<Client> {
  return call("update_client", { id, name, notes: notes ?? null });
}

export function archiveClient(id: number): Promise<Client> {
  return call("archive_client", { id });
}

export function restoreClient(id: number): Promise<Client> {
  return call("restore_client", { id });
}

// -- Projects ---------------------------------------------------------------

export function listProjects(filter: ProjectFilter): Promise<Project[]> {
  return call("list_projects", { filter });
}

export function getProject(id: number): Promise<Project> {
  return call("get_project", { id });
}

export function createProject(
  clientId: number,
  name: string,
  hourlyRate?: number | null,
): Promise<Project> {
  return call("create_project", {
    clientId,
    name,
    hourlyRate: hourlyRate ?? null,
  });
}

export function updateProject(
  id: number,
  name: string,
  hourlyRate?: number | null,
): Promise<Project> {
  return call("update_project", { id, name, hourlyRate: hourlyRate ?? null });
}

export function archiveProject(id: number): Promise<Project> {
  return call("archive_project", { id });
}

export function restoreProject(id: number): Promise<Project> {
  return call("restore_project", { id });
}

// -- Time entries -----------------------------------------------------------

export function listTimeEntries(filter: EntryFilter = {}): Promise<TimeEntry[]> {
  return call("list_time_entries", { filter });
}

export function getTimeEntry(id: number): Promise<TimeEntry> {
  return call("get_time_entry", { id });
}

export function createTimeEntry(entry: NewTimeEntry): Promise<TimeEntry> {
  return call("create_time_entry", { entry });
}

export function updateTimeEntry(
  id: number,
  edit: TimeEntryEdit,
): Promise<TimeEntry> {
  return call("update_time_entry", { id, edit });
}

/** Hard delete. The undo window that makes this safe lives in the UI. */
export function deleteTimeEntry(id: number): Promise<void> {
  return call("delete_time_entry", { id });
}

// -- Running timer ----------------------------------------------------------

/** The in-flight Pomodoro Block, or `null`. On launch, this is the question. */
export function getRunningTimer(): Promise<RunningTimer | null> {
  return call("get_running_timer");
}

export function startRunningTimer(
  projectId: number,
  plannedMinutes: number,
): Promise<RunningTimer> {
  return call("start_running_timer", { projectId, plannedMinutes });
}

/** Logs the block and clears it, in one transaction on the Rust side. */
export function stopRunningTimer(stop: StopTimer): Promise<TimeEntry> {
  return call("stop_running_timer", { stop });
}

/** Throws the block away. Nothing is written — the answer to "discard". */
export function discardRunningTimer(): Promise<void> {
  return call("discard_running_timer");
}

// -- Reports ----------------------------------------------------------------

export function reportByClient(period: Period): Promise<Report<ClientTotal>> {
  return call("report_by_client", { period });
}

export function reportByProject(period: Period): Promise<Report<ProjectTotal>> {
  return call("report_by_project", { period });
}

/**
 * Writes the entries over `range` to `path` as an `.xlsx`.
 *
 * The path comes from the native save dialog, so the user has already said
 * where — and agreed to overwrite, if it was theirs to overwrite.
 *
 * The range travels as days, not as the period that produced it: the report on
 * screen resolved "this week" once already, and asking Rust again after the
 * dialog has been open a while could answer with a different week.
 */
export function exportReport(
  path: string,
  range: DateRange,
  labels: SheetLabels,
): Promise<void> {
  return call("export_report", { path, from: range.from, to: range.to, labels });
}

// -- Settings ---------------------------------------------------------------

export function getSettings(): Promise<Settings> {
  return call("get_settings");
}

export function updateSettings(settings: Settings): Promise<Settings> {
  return call("update_settings", { settings });
}

// -- Backups ----------------------------------------------------------------

/** Reads the backup folder. Cheap: a directory listing, no copying. */
export function backupStatus(): Promise<BackupStatus> {
  return call("backup_status");
}

/**
 * Makes a backup now and rotates the folder down to seven.
 *
 * One command for both the daily one the app owes and the one the user asks
 * for by pressing the button — they are the same act, and a second command
 * would only be a second thing to keep working.
 */
export function runBackup(): Promise<BackupStatus> {
  return call("run_backup");
}

// -- Restore ----------------------------------------------------------------

/**
 * The backups that can be gone back to, newest first.
 *
 * Off the same listing rotation uses, so what is offered back and what is kept
 * can never be two different sets of files.
 */
export function listRestorableBackups(): Promise<RestorableBackup[]> {
  return call("list_restorable_backups");
}

/**
 * What restoring this backup would discard — the day, and the hours logged
 * since. Read-only: asking the cost changes nothing.
 */
export function previewRestore(fileName: string): Promise<RestorePreview> {
  return call("preview_restore", { fileName });
}

/**
 * Verifies the backup and stages it for the next launch.
 *
 * Does **not** restore. The live database is open, so the swap happens at the
 * next launch before anything opens the file (ADR-0008) — which is why the UI
 * asks for a relaunch rather than reporting success.
 */
export function stageRestore(fileName: string): Promise<void> {
  return call("stage_restore", { fileName });
}

/** Clears a staged restore. What "never mind" does, before the relaunch. */
export function cancelRestore(): Promise<void> {
  return call("cancel_restore");
}

/** When the staged restore is from, or `null` when none is waiting. */
export function pendingRestore(): Promise<Instant | null> {
  return call("pending_restore");
}

/**
 * What this launch did about a staged restore.
 *
 * Answered off state filled before the window existed, so it is a fact about
 * this launch rather than a question that could race the swap.
 */
export function restoreOutcome(): Promise<RestoreOutcome> {
  return call("restore_outcome");
}

// -- Tray -------------------------------------------------------------------

/**
 * Creates the tray icon, or renames what is already there.
 *
 * Rejects when there is no tray to speak of, which the close button needs to
 * know: hiding a window behind an icon that is not there would strand it.
 */
export function syncTray(labels: TrayLabels): Promise<void> {
  return call("sync_tray", { labels });
}
