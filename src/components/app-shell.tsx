import { useRef, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useDailyBackup } from "../backup/use-daily-backup";
import { useRestoreOutcome } from "../restore/use-restore";
import { readDuration, readEasing } from "../theme/motion";
import { requestTimerPause, requestTimerToggle } from "../tray/toggle-request";
import { useUpdatePrompt } from "../update/use-update";
import { BackupBanner } from "./backup-banner";
import { RestoreBanner } from "./restore-banner";
import { routeDirection } from "./route-direction";
import { TabBar } from "./tab-bar";
import { TransientBanner } from "./transient";
import { UpdateBanner } from "./update-banner";
import { WindowFrame } from "./window-frame";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const previousPath = useRef<string | null>(null);
  const forceNeutral = useRef(false);

  const direction = forceNeutral.current
    ? "neutral" as const
    : routeDirection(previousPath.current, location);
  const travel =
    direction === "neutral"
      ? 0
      : direction === "right"
        ? 1
        : -1;

  if (previousPath.current !== location) {
    previousPath.current = location;
    forceNeutral.current = false;
  }

  const backup = useDailyBackup();
  const restored = useRestoreOutcome();
  const update = useUpdatePrompt();

  return (
    <WindowFrame
      onTrayToggle={() => {
        requestTimerToggle();
        forceNeutral.current = true;
        void navigate({ to: "/" });
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

      <main className="relative min-h-0 flex-1 overflow-y-auto pb-20">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={location}
            className="p-6"
            initial={{
              x: `calc(${travel} * var(--motion-page-travel))`,
              opacity: 0,
            }}
            animate={{ x: 0, opacity: 1 }}
            exit={{
              x: `calc(${-travel} * var(--motion-page-travel))`,
              opacity: 0,
            }}
            transition={{
              duration: readDuration("--motion-page"),
              ease: readEasing("--ease-out-soft"),
            }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <TabBar />
    </WindowFrame>
  );
}
