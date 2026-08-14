import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useDailyBackup } from "../backup/use-daily-backup";
import { useRestoreOutcome } from "../restore/use-restore";
import { requestTimerPause, requestTimerToggle } from "../tray/toggle-request";
import { useUpdatePrompt } from "../update/use-update";
import { BackupBanner } from "./backup-banner";
import { RestoreBanner } from "./restore-banner";
import { TransientBanner } from "./transient";
import { UpdateBanner } from "./update-banner";
import { WindowFrame } from "./window-frame";

const linkClass =
  "text-sm text-ink-muted transition-colors motion-quick hover:text-ink";
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

  // Asked for here, once per launch, for the same reason the backup is: shipping
  // is a `git tag`, so an update she is never told about is an update she never
  // gets (ADR-0009). Mounted behind the lock screen, because the offer belongs to
  // whoever already got in.
  const update = useUpdatePrompt();

  // Both tray items are answered by the block's lifecycle, which sits above
  // every screen (ADR-0010), so the request is only latched and not routed
  // anywhere. Start/Stop brings the Timer up on its way — the screen is where
  // the undo for a stop appears, and it has to exist to show one. Pause has
  // nothing to show, so it does not move anybody off the screen they are on.
  return (
    <WindowFrame
      onTrayToggle={() => {
        requestTimerToggle();
        void navigate({ to: "/" });
      }}
      onTrayPause={requestTimerPause}
    >
      {/* Each banner arrives and leaves on the shared vocabulary rather than
          appearing and vanishing. The order is unchanged, and so is what puts
          each one on screen: nothing waits for an animation. */}
      <TransientBanner>
        {restored.data?.status === "failed" ? (
          <RestoreBanner fault={restored.data.fault} />
        ) : null}
      </TransientBanner>

      <TransientBanner>
        {backup.failure === null ? null : (
          <BackupBanner
            lastBackupAt={backup.failure.lastBackupAt}
            onRetry={backup.retry}
            retrying={backup.retrying}
          />
        )}
      </TransientBanner>

      {/* Last of the three, nearest the app: the other two are things that went
          wrong, and this one is only an offer. */}
      <TransientBanner>
        {update.offered === null ? null : (
          <UpdateBanner
            version={update.offered.version}
            onInstall={update.install}
            onDismiss={update.dismiss}
            installing={update.installing}
            failed={update.installFailed}
          />
        )}
      </TransientBanner>

      <nav className="flex shrink-0 items-center gap-4 border-b border-border px-6 py-2">
        <Link
          to="/"
          className={linkClass}
          activeProps={{ className: activeClass }}
        >
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
