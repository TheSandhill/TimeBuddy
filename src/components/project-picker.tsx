import { useTranslation } from "react-i18next";
import type { Project } from "../data/types";
import { pickerClass } from "./field";
import { Select } from "./select";

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
 *
 * It carries **no visible label**. The dial owns this screen and the picker is
 * one of the things visibly secondary to it, so a label above it would be a
 * third small grey line under a 66px countdown — and a select holding a project
 * name has already said what it is. The name survives for anyone not reading
 * the screen, as `aria-label`.
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
    <Select
      value={value ?? ""}
      disabled={disabled}
      aria-label={t("timer.project")}
      onChange={(event) => onChange(Number(event.target.value))}
      className={pickerClass}
    >
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </Select>
  );
}
