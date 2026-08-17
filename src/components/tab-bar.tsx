import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { tabIndicatorSpring } from "../theme/spring";
import { Icon, type IconName } from "./icon";
import { TAB_ORDER, type TabPath } from "./route-direction";

interface Tab {
  path: TabPath;
  labelKey:
    | "nav.timer"
    | "nav.entries"
    | "nav.clients"
    | "nav.reports"
    | "nav.settings";
  icon: IconName;
}

/**
 * Four of the five tabs are icon alone — only the open one says its name — so
 * the glyph is the whole of what a tab is until it is reached. That is what the
 * hand-drawn set could not carry, and why the icons here are named for the
 * screen rather than for the shape.
 */
const tabs: Tab[] = [
  { path: "/", labelKey: "nav.timer", icon: "timer" },
  { path: "/entries", labelKey: "nav.entries", icon: "entries" },
  { path: "/clients", labelKey: "nav.clients", icon: "clients" },
  { path: "/reports", labelKey: "nav.reports", icon: "reports" },
  { path: "/settings", labelKey: "nav.settings", icon: "settings" },
];

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
              className={
                "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors motion-quick " +
                // The colour sits on the tab, not on the label, so the glyph
                // and the word are one thing: on the accent pill both go to
                // the surface colour, and off it both stay muted.
                (isActive ? "text-surface" : "text-ink-muted hover:text-ink")
              }
            >
              {isActive ? (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={tabIndicatorSpring}
                />
              ) : null}
              <span className="relative z-10">
                <Icon name={tab.icon} />
              </span>
              {isActive ? (
                <motion.span
                  className="relative z-10 font-medium"
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
