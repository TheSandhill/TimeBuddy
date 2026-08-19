import { type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDailyBackup } from "../backup/use-daily-backup";
import { useRestoreOutcome } from "../restore/use-restore";
import { requestTimerPause, requestTimerToggle } from "../tray/toggle-request";
import { useUpdatePrompt } from "../update/use-update";
import { BackupBanner } from "./backup-banner";
import { RestoreBanner } from "./restore-banner";
import { TabBar } from "./tab-bar";
import { TransientBanner } from "./transient";
import { UpdateBanner } from "./update-banner";
import { WindowFrame } from "./window-frame";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const backup = useDailyBackup();
  const restored = useRestoreOutcome();
  const update = useUpdatePrompt();

  return (
    <WindowFrame
      onTrayToggle={() => {
        requestTimerToggle();
        // A navigation nobody walked gets no direction: the tab bar's order
        // means nothing to a screen the tray pulled up, so this one crosses
        // rather than leans, whichever tab it came from.
        void navigate({ to: "/", viewTransition: { types: ["neutral"] } });
      }}
      onTrayPause={requestTimerPause}
    >
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

      {/*
       * The screen is the only thing the route change snapshots. Everything
       * above it and the tab bar below stay live and untouched — which is why
       * the name sits here rather than on the document.
       */}
      <main className="screen-slide relative min-h-0 flex-1 overflow-y-auto pb-20">
        <div className="p-6">{children}</div>
      </main>

      <TabBar />
    </WindowFrame>
  );
}
