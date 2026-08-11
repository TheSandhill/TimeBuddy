import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useDailyBackup } from "../backup/use-daily-backup";
import { useRestoreOutcome } from "../restore/use-restore";
import { requestTimerToggle } from "../tray/toggle-request";
import { BackupBanner } from "./backup-banner";
import { RestoreBanner } from "./restore-banner";
import { WindowFrame } from "./window-frame";

const linkClass = "text-sm text-ink-muted transition-colors hover:text-ink";
/** The active screen is named in the accent colour, nowhere else. */
const activeClass = "text-sm text-accent";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // The daily backup is asked for here, once, rather than on the Settings
  // screen: it has to happen whether or not anybody goes looking for it, and
  // its failure has to be visible from wherever they are instead.
  const backup = useDailyBackup();

  // A restore that did not happen is announced here for the same reason a failed
  // backup is: opening on old data in silence would read as it having worked.
  // A restore that *did* happen is not announced — it is explained on the lock
  // screen it caused, and read afterwards on Settings.
  const restored = useRestoreOutcome();

  // The tray's Start/Stop item is answered by the Timer screen, which is the
  // one place that knows what a stopped block is worth — so the request is
  // latched and the Timer is navigated to, in that order, because the screen
  // has to exist before it can pick anything up.
  return (
    <WindowFrame
      onTrayToggle={() => {
        requestTimerToggle();
        void navigate({ to: "/" });
      }}
    >
      {restored.data?.status === "failed" ? (
        <RestoreBanner fault={restored.data.fault} />
      ) : null}

      {backup.failure === null ? null : (
        <BackupBanner
          lastBackupAt={backup.failure.lastBackupAt}
          onRetry={backup.retry}
          retrying={backup.retrying}
        />
      )}

      <nav className="flex shrink-0 items-center gap-4 border-b border-border px-6 py-2">
        <Link to="/" className={linkClass} activeProps={{ className: activeClass }}>
          {t("nav.timer")}
        </Link>
        <Link
          to="/entries"
          className={linkClass}
          activeProps={{ className: activeClass }}
        >
          {t("nav.entries")}
        </Link>
        <Link
          to="/clients"
          className={linkClass}
          activeProps={{ className: activeClass }}
        >
          {t("nav.clients")}
        </Link>
        <Link
          to="/reports"
          className={linkClass}
          activeProps={{ className: activeClass }}
        >
          {t("nav.reports")}
        </Link>
        <Link
          to="/settings"
          className={linkClass}
          activeProps={{ className: activeClass }}
        >
          {t("nav.settings")}
        </Link>
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
    </WindowFrame>
  );
}
