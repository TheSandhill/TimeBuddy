import { useId } from "react";
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
 * next block and look like it had done nothing. Dead **and saying why**
 * (`CONTEXT.md`): a control that stops answering without explaining itself is
 * indistinguishable from a broken one. One short line, and each button points
 * at it: a description on the group as well would have it read five times.
 */
export const PRESET_MINUTES = [15, 25, 45, 60] as const;

export function DurationPresets({
  value,
  onChange,
  disabled,
  frozen,
}: {
  /** The length in force, marked pressed when it is one of the four. */
  value: number;
  onChange: (minutes: number) => void;
  /** Dead for a reason this screen does not explain — nothing to change yet. */
  disabled: boolean;
  /** Dead because a block is under way, which is a reason worth giving. */
  frozen: boolean;
}) {
  const { t } = useTranslation();
  const reasonId = useId();

  return (
    <div className="flex flex-col gap-2">
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
              aria-describedby={frozen ? reasonId : undefined}
              disabled={disabled || frozen}
              onClick={() => onChange(minutes)}
              className={`${toggleButtonClass(chosen)} flex-1`}
            >
              {t("timer.preset", { minutes })}
            </button>
          );
        })}
      </div>

      {frozen ? (
        <p id={reasonId} className="text-xs text-ink-muted">
          {t("timer.presetFrozen")}
        </p>
      ) : null}
    </div>
  );
}
