import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Settings } from "../data/types";

const commands = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock("../data/commands", () => commands);

const { useAppearance, useSavedAppearance } = await import("./use-appearance");

/**
 * A stand-in for `prefers-color-scheme`, which jsdom does not implement. It
 * records its listeners so a test can move the OS preference under a mounted
 * component — the whole question "does it change without a reload".
 */
function stubMatchMedia(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) =>
      void listeners.add(listener),
    removeEventListener: (
      _: string,
      listener: (e: MediaQueryListEvent) => void,
    ) => void listeners.delete(listener),
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );

  return {
    listeners,
    set(nowDark: boolean) {
      query.matches = nowDark;
      for (const listener of listeners) {
        listener({ matches: nowDark } as MediaQueryListEvent);
      }
    },
  };
}

function Appearance(props: Parameters<typeof useAppearance>[0]) {
  useAppearance(props);
  return null;
}

const shown = () => document.documentElement.dataset.theme;

const stored: Settings = {
  theme: "walnut",
  followSystem: false,
  language: "nl",
  pomodoroMinutes: 25,
  breakMinutes: 5,
  chimeEnabled: true,
  notificationsEnabled: true,
  autostart: false,
  backupFolder: null,
  updatedAt: "2026-08-09T12:00:00Z",
};

/** The shell, reduced to the one thing this file is about. */
function Shell() {
  useSavedAppearance();
  return null;
}

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Shell />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  commands.getSettings.mockResolvedValue(stored);
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("lang");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("applying a theme without a reload", () => {
  it("puts the chosen theme on the document", () => {
    stubMatchMedia(true);
    render(<Appearance theme="sand" followSystem={false} language="nl" />);

    expect(shown()).toBe("sand");
  });

  it("swaps to another theme in place", () => {
    stubMatchMedia(true);
    const { rerender } = render(
      <Appearance theme="sand" followSystem={false} language="nl" />,
    );

    rerender(
      <Appearance theme="high-contrast" followSystem={false} language="nl" />,
    );

    expect(shown()).toBe("high-contrast");
  });

  it("ignores the OS while following it is off", () => {
    const os = stubMatchMedia(true);
    render(<Appearance theme="sand" followSystem={false} language="nl" />);

    act(() => os.set(false));

    expect(shown()).toBe("sand");
  });

  it("moves with the OS once following it is on", () => {
    const os = stubMatchMedia(true);
    render(<Appearance theme="sand" followSystem language="nl" />);
    expect(shown()).toBe("walnut");

    act(() => os.set(false));

    expect(shown()).toBe("sand");
  });

  it("stops listening to the OS when it is unmounted", () => {
    const os = stubMatchMedia(true);
    const { unmount } = render(
      <Appearance theme="sand" followSystem language="nl" />,
    );

    unmount();

    expect(os.listeners.size).toBe(0);
  });

  it("falls back to the chosen theme where there is no matchMedia at all", () => {
    // A locked-down webview, or jsdom. Better a fixed theme than none.
    vi.stubGlobal("matchMedia", undefined);

    render(<Appearance theme="sand" followSystem language="nl" />);

    expect(shown()).toBe("sand");
  });
});

describe("applying a language without a reload", () => {
  it("switches i18next and the document's own lang", async () => {
    stubMatchMedia(true);
    const i18n = createI18n("nl");
    const { rerender } = render(
      <Appearance theme="walnut" followSystem={false} language="nl" i18n={i18n} />,
    );

    rerender(
      <Appearance theme="walnut" followSystem={false} language="en" i18n={i18n} />,
    );

    // The instance switches asynchronously; the attribute follows it.
    await vi.waitFor(() => expect(i18n.language).toBe("en"));
    await vi.waitFor(() =>
      expect(document.documentElement.lang).toBe("en"),
    );
  });
});

describe("the app wears what the settings row says", () => {
  it("applies the saved theme and language once the row arrives", async () => {
    stubMatchMedia(false);
    commands.getSettings.mockResolvedValue({
      ...stored,
      theme: "high-contrast",
      language: "en",
    });

    renderShell();

    await waitFor(() => expect(shown()).toBe("high-contrast"));
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  });

  it("shows the shipped default while the row is still on its way", () => {
    stubMatchMedia(false);

    renderShell();

    expect(shown()).toBe("walnut");
  });

  it("stays styled when the settings cannot be read at all", async () => {
    stubMatchMedia(false);
    commands.getSettings.mockRejectedValue({
      kind: "database",
      message: "disk gone",
    });

    renderShell();

    // An unreadable database is a bad day, not a reason to render white on
    // white.
    await waitFor(() => expect(commands.getSettings).toHaveBeenCalled());
    expect(shown()).toBe("walnut");
  });
});
