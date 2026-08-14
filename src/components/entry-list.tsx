import { useTranslation } from "react-i18next";
import { projectName } from "../data/project-name";
import type { Project, TimeEntry } from "../data/types";
import { dayLabel } from "../entries/day-label";
import { formatDuration } from "../entries/duration";
import type { EntryDay } from "../entries/grouping";
import { windowOf } from "../entries/window";
import { formatClock } from "../timer/clock";

interface EntryListProps {
  days: EntryDay[];
  projects: Project[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
}

/**
 * The hours, read back a day at a time.
 *
 * A day is the unit someone remembers work in, so the day total sits in the
 * heading rather than being left for the reader to add up.
 */
export function EntryList({ days, projects, onEdit, onDelete }: EntryListProps) {
  const { t, i18n } = useTranslation();

  const nameOf = (projectId: number) =>
    projectName(projects, projectId, t("entries.unknownProject"));

  if (days.length === 0) {
    return <p className="text-sm text-ink-muted">{t("entries.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.date} className="flex flex-col gap-2">
          <h3 className="flex items-baseline justify-between gap-4 border-b border-border pb-1">
            <span className="text-xs uppercase tracking-widest text-ink-muted">
              {dayLabel(day.date, i18n.language)}
            </span>
            <span className="text-sm tabular-nums text-ink">
              {formatDuration(day.totalMinutes)}
            </span>
          </h3>

          <ul className="flex flex-col divide-y divide-border">
            {day.entries.map((entry) => {
              const project = nameOf(entry.projectId);
              const ran = windowOf(entry);
              return (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-4 py-2"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-ink">{project}</span>
                    {entry.note ? (
                      <span className="truncate text-xs text-ink-muted">
                        {entry.note}
                      </span>
                    ) : null}
                  </span>

                  <span className="flex shrink-0 items-baseline gap-3 text-sm text-ink-muted">
                    {ran ? (
                      <span className="tabular-nums text-xs">
                        {`${formatClock(ran.startAt)}–${formatClock(ran.endAt)}`}
                      </span>
                    ) : null}
                    <span className="tabular-nums text-ink">
                      {formatDuration(entry.durationMinutes)}
                    </span>

                    <button
                      type="button"
                      aria-label={t("entries.editEntry", { project })}
                      onClick={() => onEdit(entry)}
                      className="text-xs uppercase tracking-widest transition-colors motion-quick hover:text-ink"
                    >
                      {t("entries.edit")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("entries.deleteEntry", { project })}
                      onClick={() => onDelete(entry)}
                      className="text-xs uppercase tracking-widest transition-colors motion-quick hover:text-danger"
                    >
                      {t("entries.delete")}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
