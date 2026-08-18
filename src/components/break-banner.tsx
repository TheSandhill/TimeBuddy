import { useTranslation } from "react-i18next";
import { Icon } from "./icon";

interface BreakBannerProps {
  countdown: string;
  onSkip: () => void;
}

/**
 * The Break countdown.
 *
 * A Break produces a chime and this banner and nothing else — it is never
 * written to the database, because a break is not work and therefore not hours
 * (`CONTEXT.md`).
 *
 * It stays as loud as it was while the dial grew around it: it is the one thing
 * on this screen that arrives unasked, and it carries Skip. Quieting it to make
 * room for the ring would be taking the ring's side against the news.
 */
export function BreakBanner({ countdown, onSkip }: BreakBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between rounded-md bg-surface-raised px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        <Icon name="timer" />
        {t("timer.breakTitle")}
      </span>
      <span className="text-sm tabular-nums text-ink">{countdown}</span>
      <button
        type="button"
        onClick={onSkip}
        className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
      >
        {t("timer.skipBreak")}
      </button>
    </div>
  );
}
