import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Day, Project, TimeEntry } from "../data/types";
import { durationErrorKey } from "../data/error-message";
import { formatDuration, parseDuration } from "../entries/duration";

/** What the form is worth once it reads. Times are absent on purpose. */
export interface EntryFormValues {
  projectId: number;
  date: Day;
  durationMinutes: number;
  note: string | null;
}

interface EntryFormProps {
  projects: Project[];
  /** The entry being corrected, or `null` to add one. */
  entry: TimeEntry | null;
  today: Day;
  busy: boolean;
  /** A message from the command layer, already translated. */
  error: string | null;
  onSubmit: (values: EntryFormValues) => void;
  onCancel: () => void;
}

const field = "rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink";
const label = "flex flex-col gap-1 text-xs uppercase tracking-widest text-ink-muted";

/**
 * Adding or correcting hours by hand — the primary input path, because people
 * forget to press start.
 *
 * `startAt` / `endAt` are nowhere in this form. A manually entered "2 hours on
 * Tuesday" has no start time, and inventing one would be a lie (`CONTEXT.md`).
 */
export function EntryForm({
  projects,
  entry,
  today,
  busy,
  error,
  onSubmit,
  onCancel,
}: EntryFormProps) {
  const { t } = useTranslation();

  const [projectId, setProjectId] = useState<number | null>(
    entry?.projectId ?? projects[0]?.id ?? null,
  );
  const [date, setDate] = useState<Day>(entry?.date ?? today);
  const [duration, setDuration] = useState(
    entry ? formatDuration(entry.durationMinutes) : "",
  );
  const [note, setNote] = useState(entry?.note ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  // An entry can outlive its project's place in the picker: projects are
  // archived, never deleted, and yesterday's hours still point at them.
  const options =
    projectId !== null && !projects.some((project) => project.id === projectId)
      ? [...projects, { id: projectId, name: t("entries.unknownProject") }]
      : projects;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (projectId === null) {
      return;
    }

    const parsed = parseDuration(duration);
    if (!parsed.ok) {
      setProblem(t(durationErrorKey(parsed.problem)));
      return;
    }

    setProblem(null);
    onSubmit({
      projectId,
      date,
      durationMinutes: parsed.minutes,
      note: note.trim() === "" ? null : note.trim(),
    });
  }

  /** What the field itself found beats what the command came back with. */
  const message = problem ?? error;

  if (projects.length === 0 && entry === null) {
    return <p className="text-sm text-ink-muted">{t("entries.noProjects")}</p>;
  }

  return (
    <form
      onSubmit={submit}
      aria-label={entry ? t("entries.editTitle") : t("entries.newTitle")}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4"
    >
      <h2 className="text-sm font-medium text-ink">
        {entry ? t("entries.editTitle") : t("entries.newTitle")}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <label className={label}>
          {t("entries.project")}
          <select
            className={field}
            value={projectId ?? ""}
            onChange={(event) => setProjectId(Number(event.target.value))}
          >
            {options.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          {t("entries.date")}
          <input
            className={field}
            type="date"
            value={date}
            max={today}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>

        <label className={label}>
          {t("entries.duration")}
          <input
            className={field}
            value={duration}
            inputMode="text"
            placeholder={t("entries.durationHint")}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>

        <label className={label}>
          {t("entries.note")}
          <input
            className={field}
            value={note}
            placeholder={t("entries.notePlaceholder")}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>

      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {t("entries.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          {t("entries.cancel")}
        </button>
      </div>
    </form>
  );
}
