import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { tabIndicatorSpring } from "../theme/spring";
import { TAB_ORDER, type TabPath } from "./route-direction";

interface Tab {
  path: TabPath;
  labelKey:
    | "nav.timer"
    | "nav.entries"
    | "nav.clients"
    | "nav.reports"
    | "nav.settings";
  icon: string;
}

const tabs: Tab[] = [
  { path: "/", labelKey: "nav.timer", icon: "M6 1v4M6 8v3M2 5h8" },
  {
    path: "/entries",
    labelKey: "nav.entries",
    icon: "M2 3h8M2 6h8M2 9h5",
  },
  {
    path: "/clients",
    labelKey: "nav.clients",
    icon: "M6 5.5a2 2 0 1 0 0-4 2 2 0 1 0 0 4ZM2 11a4 4 0 0 1 8 0",
  },
  {
    path: "/reports",
    labelKey: "nav.reports",
    icon: "M2 10V4M5 10V2M8 10V6",
  },
  {
    path: "/settings",
    labelKey: "nav.settings",
    icon: "M6 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.46 2.46l1.06 1.06M8.48 8.48l1.06 1.06M9.54 2.46L8.48 3.52M3.52 8.48l-1.06 1.06",
  },
];

function TabIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export function TabBar() {
  const { t } = useTranslation();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const active = TAB_ORDER.includes(location as TabPath)
    ? (location as TabPath)
    : "/";

  return (
    <nav
      role="tablist"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-10 flex justify-center"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface-raised/90 px-2 py-1.5 shadow-lg backdrop-blur-md">
        {tabs.map((tab) => {
          const isActive = tab.path === active;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              role="tab"
              aria-selected={isActive}
              aria-label={t(tab.labelKey)}
              className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-muted transition-colors motion-quick hover:text-ink"
            >
              {isActive ? (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={tabIndicatorSpring}
                />
              ) : null}
              <span className="relative z-10">
                <TabIcon d={tab.icon} />
              </span>
              {isActive ? (
                <motion.span
                  className="relative z-10 font-medium text-surface"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={tabIndicatorSpring}
                >
                  {t(tab.labelKey)}
                </motion.span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
