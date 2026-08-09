import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { AppShell } from "./components/app-shell";
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

export const router = createRouter({
  routeTree: rootRoute.addChildren([timerRoute]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
