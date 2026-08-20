import { useTranslation } from "react-i18next";
import { momentLabel } from "../backup/moment-label";
import type { Instant } from "../data/types";
import { Icon } from "./icon";

interface BackupBannerProps {
  /** The newest backup that did work. `null` when there is none at all. */
  lastBackupAt: Instant | null;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * The one place the app says its backups have stopped working.
 *
 * Across the top of every screen rather than only on Settings, because nobody
 * opens Settings to find out whether their year of billing history is still
 * there. It carries the retry, so the answer to "the drive was unplugged" is a
 * button and not a hunt.
 *
 * There is no dismiss. The condition going away is what takes it down — a
 * warning about losing a year of work that can be waved off is one that will be.
 */
export function BackupBanner({
  lastBackupAt,
  onRetry,
  retrying,
}: BackupBannerProps) {
  const { t, i18n } = useTranslation();

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-4 border-b border-danger bg-surface-raised px-6 py-2"
    >
      <span className="glyph-label min-w-0 text-sm text-danger">
        {/*
          `warning` rather than `error` (ADR-0014): the backup runs unbidden and
          the sentence beside this names the copy that is still good.
        */}
        <Icon name="warning" className="size-4 shrink-0" />
        {lastBackupAt === null
          ? t("backup.failedWithNone")
          : t("backup.failedWithLast", {
              when: momentLabel(lastBackupAt, i18n.language),
            })}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="shrink-0 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
      >
        {retrying ? t("backup.running") : t("backup.retry")}
      </button>
    </div>
  );
}
