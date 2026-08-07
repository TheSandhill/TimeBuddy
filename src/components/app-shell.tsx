import type { ReactNode } from "react";
import { Titlebar } from "./titlebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <Titlebar />
      <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
