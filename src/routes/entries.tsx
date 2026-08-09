/**
 * The Entries screen — where hours are read back, corrected, and mostly typed
 * in in the first place. Manual entry is the primary input path: people forget
 * to press start (`CONTEXT.md`).
 *
 * The screen owns three things and delegates the rest: which days are in view,
 * whether the form is open, and which row is inside its undo window.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DateRangeFilter } from "../components/date-range-filter";
import { EntryForm, type EntryFormValues } from "../components/entry-form";
import { EntryList } from "../components/entry-list";
import { UndoToast } from "../components/undo-toast";
import {
  createTimeEntry,
  deleteTimeEntry,
  listProjects,
  listTimeEntries,
  updateTimeEntry,
} from "../data/commands";
import { errorKey } from "../data/error-message";
import type { DateRange, Day, TimeEntry } from "../data/types";
import { formatDuration } from "../entries/duration";
import { groupByDay, sumMinutes } from "../entries/grouping";
import { useUndoableDelete } from "../entries/use-undoable-delete";
import { currentInstant, localDay } from "../timer/clock";

/** What is open in the form: nothing, a new entry, or one being corrected. */
type Editing = { entry: TimeEntry | null } | null;

/** The month so far — the range someone filling in a timesheet is looking at. */
function monthToDate(today: Day): DateRange {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function Entries() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const today = localDay(currentInstant());
  const [range, setRange] = useState<DateRange>(() => monthToDate(today));
  const [editing, setEditing] = useState<Editing>(null);
  /** A rejected write, kept apart: a failed delete is not the form's problem. */
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const backwards = range.from > range.to;

  // Naming an hour and offering work are different questions. An archived
  // project — or one whose client was archived — still names the hours already
  // booked to it; it is only no longer on offer.
  const projects = useQuery({
    queryKey: ["projects", "all"],
    queryFn: () => listProjects({ includeArchived: true }),
  });
  const offerable = useQuery({
    queryKey: ["projects", "offerable"],
    queryFn: () => listProjects({ includeArchived: false }),
  });
  const entries = useQuery({
    queryKey: ["timeEntries", range.from, range.to],
    queryFn: () => listTimeEntries({ from: range.from, to: range.to }),
    enabled: !backwards,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["timeEntries"] });

  const remove = useMutation({
    mutationFn: (entry: TimeEntry) => deleteTimeEntry(entry.id),
    onSuccess: () => refresh(),
    onError: (error) => setDeleteError(t(errorKey(error))),
  });

  // The delete is deferred, not undone: until the window runs out the row is
  // only hidden, so undo cannot fail.
  const deletion = useUndoableDelete(remove.mutate);

  const save = useMutation({
    mutationFn: ({
      entry,
      values,
    }: {
      entry: TimeEntry | null;
      values: EntryFormValues;
    }) =>
      entry
        ? updateTimeEntry(entry.id, values)
        : createTimeEntry({ ...values, source: "manual" }),
    onSuccess: async () => {
      setEditing(null);
      setFormError(null);
      await refresh();
    },
    onError: (error) => setFormError(t(errorKey(error))),
  });

  const visible = (entries.data ?? []).filter(
    (entry) => entry.id !== deletion.pending?.id,
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <DateRangeFilter range={range} onChange={setRange} />

        <div className="flex items-center gap-6">
          <p className="flex flex-col text-xs uppercase tracking-widest text-ink-muted">
            {t("entries.total")}
            <span className="text-lg tabular-nums text-ink">
              {formatDuration(sumMinutes(visible))}
            </span>
          </p>

          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setEditing({ entry: null });
            }}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
          >
            {t("entries.add")}
          </button>
        </div>
      </header>

      {backwards ? (
        <p role="alert" className="text-sm text-danger">
          {t("error.rangeEndsBeforeStart")}
        </p>
      ) : null}

      {deleteError ? (
        <p role="alert" className="text-sm text-danger">
          {deleteError}
        </p>
      ) : null}

      {editing ? (
        <EntryForm
          // A fresh form per entry: the fields are initial state, not props.
          key={editing.entry?.id ?? "new"}
          projects={offerable.data ?? []}
          entry={editing.entry}
          today={today}
          busy={save.isPending}
          error={formError}
          onSubmit={(values) => save.mutate({ entry: editing.entry, values })}
          onCancel={() => {
            setEditing(null);
            setFormError(null);
          }}
        />
      ) : null}

      <EntryList
        days={groupByDay(visible)}
        projects={projects.data ?? []}
        onEdit={(entry) => {
          setFormError(null);
          setEditing({ entry });
        }}
        onDelete={(entry) => {
          // Editing a row that is on its way out would be a dead end.
          setEditing(null);
          setDeleteError(null);
          deletion.request(entry);
        }}
      />

      {deletion.pending ? <UndoToast onUndo={deletion.undo} /> : null}
    </section>
  );
}
