import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Titlebar } from "./titlebar";

const linkClass = "text-sm text-ink-muted transition-colors hover:text-ink";
/** The active screen is named in the accent colour, nowhere else. */
const activeClass = "text-sm text-accent";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <Titlebar />

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
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
