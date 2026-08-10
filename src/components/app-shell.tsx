import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSavedAppearance } from "../theme/use-appearance";
import { useRunningBlock } from "../timer/use-running-block";
import { requestTimerToggle } from "../tray/toggle-request";
import { useTray } from "../tray/use-tray";
import { Titlebar } from "./titlebar";

const linkClass = "text-sm text-ink-muted transition-colors hover:text-ink";
/** The active screen is named in the accent colour, nowhere else. */
const activeClass = "text-sm text-accent";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // The shell applies the saved look on every screen, so the Settings screen
  // only has to save — and every other screen still gets the theme right on a
  // cold start.
  useSavedAppearance();

  // The pill and the tooltip watch the same block, so the shell reads it once
  // and they cannot disagree about what second it is.
  const running = useRunningBlock();

  // The tray belongs to the window, not to a screen: it has to keep counting
  // down while the window is hidden, whichever screen was open when it went.
  //
  // Its Start/Stop item is answered by the Timer screen, which is the one
  // place that knows what a stopped block is worth — so the request is latched
  // and the Timer is navigated to, in that order, because the screen has to
  // exist before it can pick anything up.
  useTray(running, () => {
    requestTimerToggle();
    void navigate({ to: "/" });
  });

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <Titlebar {...running} />

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
    </div>
  );
}
