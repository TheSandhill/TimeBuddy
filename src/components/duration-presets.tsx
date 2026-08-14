import { useTranslation } from "react-i18next";
import { toggleButtonClass } from "./button";

/**
 * The lengths a block can be started at, one click away.
 *
 * Settings holds the same number, and this does not compete with it — picking a
 * preset *is* a write to that row. So there is one block length in the app, and
 * the buried number and the button in front of you can never disagree.
 *
 * A fixed four rather than an editable set: an editable one needs somewhere to
 * live, and the whole point of these is to be quicker than the screen that
 * already exists. None of them can exceed a day, so the entry rules never come
 * into it.
 *
 * Disabled while a block runs, like the project picker beside it, because
 * `planned_minutes` is frozen at start — a live button here would change the
 * next block and look like it had done nothing.
 */
export const PRESET_MINUTES = [15, 25, 45, 60] as const;

export function DurationPresets({
  value,
  onChange,
  disabled,
}: {
  /** The length in force, marked pressed when it is one of the four. */
  value: number;
  onChange: (minutes: number) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={t("timer.presetGroup")}
    >
      {PRESET_MINUTES.map((minutes) => {
        const chosen = minutes === value;
        return (
          <button
            key={minutes}
            type="button"
            aria-pressed={chosen}
            aria-label={t("timer.presetLabel", { minutes })}
            disabled={disabled}
            onClick={() => onChange(minutes)}
            className={`${toggleButtonClass(chosen)} tabular-nums`}
          >
            {t("timer.preset", { minutes })}
          </button>
        );
      })}
    </div>
  );
}
