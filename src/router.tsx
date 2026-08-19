import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { AppShell } from "./components/app-shell";
import { routeDirection } from "./components/route-direction";
import { Clients } from "./routes/clients";
import { Entries } from "./routes/entries";
import { Reports } from "./routes/reports";
import { Settings } from "./routes/settings";
import { Timer } from "./routes/timer";

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

/** The Timer is the app's front door — it is the reason the app exists. */
const timerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Timer,
});

/** Where hours are read back and — mostly — typed in. */
const entriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entries",
  component: Entries,
});

/**
 * Where the work itself is named: an exclusive accordion of clients, with each
 * client's projects inside its own panel.
 */
const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients",
  component: Clients,
});

/** What the hours add up to, and the door the xlsx export leaves by. */
const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports",
  component: Reports,
});

/** The one row in `settings`, and the only screen that writes it. */
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: Settings,
});

/**
 * Exported so a test can put a memory history under the real tree. What lives
 * above the `<Outlet/>` and what lives below it is the whole subject of
 * ADR-0010, and a test that rebuilt the tree itself could not fail when the
 * boundary moved.
 */
export const routeTree = rootRoute.addChildren([
  timerRoute,
  entriesRoute,
  clientsRoute,
  reportsRoute,
  settingsRoute,
]);

/**
 * Which way a route change leans, as a view-transition *type* — the one place
 * that decides it, for every navigation in the app.
 *
 * The router hands the update to `document.startViewTransition({ update, types })`
 * and the type lands as `:active-view-transition-type(...)` in the cascade, so
 * the direction is chosen here and spent entirely in CSS. Nothing renders a
 * distance and no component holds the previous path to work one out.
 *
 * A navigation nobody walked — the tray pulling the Timer up — passes its own
 * `neutral` and never reaches this.
 */
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) => [
      routeDirection(fromLocation?.pathname, toLocation.pathname),
    ],
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
