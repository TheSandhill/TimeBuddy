import { useTranslation } from "react-i18next";
import type { Project } from "../data/types";

interface ProjectPickerProps {
  projects: Project[];
  value: number | null;
  onChange: (projectId: number) => void;
  disabled: boolean;
}

/**
 * Which project the next Pomodoro Block belongs to.
 *
 * A plain select: this screen is mostly whitespace, and one question with one
 * answer does not need a custom control.
 */
export function ProjectPicker({
  projects,
  value,
  onChange,
  disabled,
}: ProjectPickerProps) {
  const { t } = useTranslation();

  if (projects.length === 0) {
    return <p className="text-sm text-ink-muted">{t("timer.noProjects")}</p>;
  }

  return (
    <label className="flex flex-col items-center gap-2">
      <span className="text-xs uppercase tracking-widest text-ink-muted">
        {t("timer.project")}
      </span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink disabled:opacity-50"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}
