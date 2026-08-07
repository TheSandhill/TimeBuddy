/**
 * The typed boundary to the Rust command layer.
 *
 * Every read and write in the app goes through a function here. `invoke` is
 * called in exactly one place (`call`), so no component can reach the backend
 * with an untyped string and an object of `any` (ADR-0002).
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  Client,
  ClientTotal,
  DateRange,
  Day,
  EntryFilter,
  NewTimeEntry,
  Project,
  ProjectFilter,
  ProjectTotal,
  Report,
  Settings,
  TimeEntry,
  TimeEntryEdit,
} from "./types";

/**
 * Every command the Rust side registers. Kept in sync with
 * `generate_handler!` by `commands.test.ts` — a command added on one side and
 * not the other fails the suite rather than the app.
 */
export const commandNames = [
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
  "report_by_client",
  "report_by_project",
  "iso_week_of",
  "get_settings",
  "update_settings",
] as const;

export type CommandName = (typeof commandNames)[number];

function call<Result>(
  name: CommandName,
  args?: Record<string, unknown>,
): Promise<Result> {
  return invoke<Result>(name, args);
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

// -- Reports ----------------------------------------------------------------

export function reportByClient(
  range: DateRange,
): Promise<Report<ClientTotal>> {
  return call("report_by_client", { from: range.from, to: range.to });
}

export function reportByProject(
  range: DateRange,
): Promise<Report<ProjectTotal>> {
  return call("report_by_project", { from: range.from, to: range.to });
}

/** The Monday-to-Sunday week a date falls in, decided by Rust, not by JS. */
export function isoWeekOf(date: Day): Promise<DateRange> {
  return call("iso_week_of", { date });
}

// -- Settings ---------------------------------------------------------------

export function getSettings(): Promise<Settings> {
  return call("get_settings");
}

export function updateSettings(settings: Settings): Promise<Settings> {
  return call("update_settings", { settings });
}
