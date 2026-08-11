import { useTranslation } from "react-i18next";

interface UpdateBannerProps {
  /** The version on offer. Named, so the bar is about something. */
  version: string;
  onInstall: () => void;
  onDismiss: () => void;
  installing: boolean;
  /** The last install attempt failed. The offer stays; the reason is added. */
  failed: boolean;
}

/**
 * The one place the app offers a newer version of itself.
 *
 * Across the top like the backup warning, because an update is not something
 * anybody opens Settings to go and find — but a **status**, not an alert:
 * nothing is wrong, and dressing an offer as an alarm is how alarms stop being
 * read.
 *
 * It **can** be waved off, which is the difference from the backup warning: that
 * one is about losing a year of work and this one is about a version number. The
 * dismissal lasts one launch, so ignoring an update is easy and forgetting it
 * forever is not.
 *
 * The restart is said out loud before the button that causes it. TimeBuddy may
 * have a block running, and a window that vanishes and comes back unannounced
 * reads as a crash — the same reason the first hide to the tray explains itself
 * (ADR-0004).
 */
export function UpdateBanner({
  version,
  onInstall,
  onDismiss,
  installing,
  failed,
}: UpdateBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-raised px-6 py-2"
    >
      <span className="text-sm text-ink">
        {t("update.available", { version })}{" "}
        <span className="text-ink-muted">{t("update.restartWarning")}</span>
      </span>

      <span className="flex shrink-0 items-center gap-4">
        {failed ? (
          <span role="alert" className="text-sm text-danger">
            {t("update.installFailed")}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onInstall}
          disabled={installing}
          className="shrink-0 text-sm text-accent underline-offset-4 hover:underline"
        >
          {installing ? t("update.installing") : t("update.install")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={installing}
          className="shrink-0 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {t("update.later")}
        </button>
      </span>
    </div>
  );
}
