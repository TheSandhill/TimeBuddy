import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { AppShell } from "./components/app-shell";
import { Clients } from "./routes/clients";
import { Entries } from "./routes/entries";
import { Reports } from "./routes/reports";
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

/** Where the work itself is named: clients on the left, their projects right. */
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

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    timerRoute,
    entriesRoute,
    clientsRoute,
    reportsRoute,
  ]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
