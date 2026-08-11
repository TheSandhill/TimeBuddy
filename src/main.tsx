import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { Gate } from "./auth/gate";
import { RootBoundary } from "./components/root-boundary";
import { i18n } from "./i18n/config";
import { router } from "./router";
import { applyTheme, defaultTheme } from "./theme/tokens";
import "./styles.css";

applyTheme(defaultTheme);
document.documentElement.lang = i18n.language;

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/*
      Outermost, so it also catches a provider that fails to mount. The window
      has no decorations of its own (ADR-0004), which is why a render fault above
      the titlebar leaves nothing at all on screen rather than a broken screen.
    */}
    <RootBoundary>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          {/* The router is only ever mounted behind an open door (ADR-0003). */}
          <Gate>
            <RouterProvider router={router} />
          </Gate>
        </QueryClientProvider>
      </I18nextProvider>
    </RootBoundary>
  </React.StrictMode>,
);
