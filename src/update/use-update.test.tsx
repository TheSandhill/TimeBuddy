import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updater = vi.hoisted(() => ({
  currentVersion: vi.fn(),
  checkForUpdate: vi.fn(),
}));
vi.mock("./updater", () => updater);

const { useCurrentVersion, useUpdateCheck, useUpdatePrompt } =
  await import("./use-update");

/** What `checkForUpdate` answers with when GitHub has a newer TimeBuddy. */
const newer = (version = "0.2.0") => ({ version, install: vi.fn() });

const offline = new Error("error sending request");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  updater.currentVersion.mockResolvedValue("0.1.0");
  updater.checkForUpdate.mockResolvedValue(null);
});

describe("the update check", () => {
  it("asks GitHub once, on the launch that mounted it", async () => {
    const { rerender } = renderHook(() => useUpdateCheck(), { wrapper });

    await waitFor(() => expect(updater.checkForUpdate).toHaveBeenCalled());
    rerender();
    rerender();
    expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("reports the newest version when there is one", async () => {
    updater.checkForUpdate.mockResolvedValue(newer("0.2.0"));

    const { result } = renderHook(() => useUpdateCheck(), { wrapper });

    await waitFor(() => expect(result.current.update?.version).toBe("0.2.0"));
    expect(result.current.failed).toBe(false);
  });

  it("says this is the newest when it is", async () => {
    const { result } = renderHook(() => useUpdateCheck(), { wrapper });

    await waitFor(() => expect(result.current.update).toBeNull());
    expect(result.current.failed).toBe(false);
  });

  it("does not retry a check it could not make", async () => {
    // A laptop on a train has no GitHub. Retrying in a loop would be traffic
    // nobody asked for, and the answer would still be "ask again later" — which
    // is what the button in Settings is for.
    updater.checkForUpdate.mockRejectedValue(offline);

    const { result } = renderHook(() => useUpdateCheck(), { wrapper });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.update).toBeUndefined();
  });

  it("asks again when the user asks it to", async () => {
    updater.checkForUpdate.mockRejectedValueOnce(offline);

    const { result } = renderHook(() => useUpdateCheck(), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));

    updater.checkForUpdate.mockResolvedValue(newer("0.2.0"));
    act(() => result.current.check());

    await waitFor(() => expect(result.current.update?.version).toBe("0.2.0"));
    expect(result.current.failed).toBe(false);
  });
});

describe("the update prompt", () => {
  const mounted = () => renderHook(() => useUpdatePrompt(), { wrapper });

  it("offers nothing before the check has answered", () => {
    // Not knowing yet is not news. A bar that appears on every launch and
    // retracts a moment later is one that gets read as noise by the second week.
    const { result } = mounted();

    expect(result.current.offered).toBeNull();
  });

  it("offers the newer version once the check has found one", async () => {
    updater.checkForUpdate.mockResolvedValue(newer("0.2.0"));

    const { result } = mounted();

    await waitFor(() =>
      expect(result.current.offered).toEqual({ version: "0.2.0" }),
    );
  });

  it("offers nothing when the check failed", async () => {
    // Unlike a failed backup, a check that could not be made is not announced:
    // nothing is at risk, and there is nothing for the user to do about it from
    // wherever they happen to be standing. Settings says so, where it is read.
    updater.checkForUpdate.mockRejectedValue(offline);

    const { result } = mounted();

    await waitFor(() => expect(updater.checkForUpdate).toHaveBeenCalled());
    expect(result.current.offered).toBeNull();
  });

  it("takes the offer down when it is waved off", async () => {
    updater.checkForUpdate.mockResolvedValue(newer("0.2.0"));

    const { result } = mounted();
    await waitFor(() => expect(result.current.offered).not.toBeNull());

    act(() => result.current.dismiss());

    expect(result.current.offered).toBeNull();
  });

  it("offers the next version even though the last one was waved off", async () => {
    // "Later" is about the version it was said to, not about updates in general.
    // Checked through the *other* hook on purpose: the bar and the button in
    // Settings read one cache entry, so a check made over there is the same
    // check, and the answer has to reach the bar without a reload.
    updater.checkForUpdate.mockResolvedValue(newer("0.2.0"));

    const { result } = renderHook(
      () => ({ bar: useUpdatePrompt(), settings: useUpdateCheck() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.bar.offered).not.toBeNull());
    act(() => result.current.bar.dismiss());
    expect(result.current.bar.offered).toBeNull();

    updater.checkForUpdate.mockResolvedValue(newer("0.3.0"));
    act(() => result.current.settings.check());

    await waitFor(() =>
      expect(result.current.bar.offered).toEqual({ version: "0.3.0" }),
    );
  });

  it("installs the update the check handed it, not a version number", async () => {
    // The frontend never re-asks for the update it is about to install: the
    // object that said "0.2.0 exists" is the one that knows where to get it,
    // and asking again could answer with a different release.
    const update = newer("0.2.0");
    updater.checkForUpdate.mockResolvedValue(update);

    const { result } = mounted();
    await waitFor(() => expect(result.current.offered).not.toBeNull());

    act(() => result.current.install());

    await waitFor(() => expect(update.install).toHaveBeenCalledTimes(1));
  });

  it("says it is working while a download is in flight", async () => {
    // A download over a home connection is long enough that a button which
    // looked unpressed would be pressed twice.
    const update = newer("0.2.0");
    update.install.mockReturnValue(new Promise(() => {}));
    updater.checkForUpdate.mockResolvedValue(update);

    const { result } = mounted();
    await waitFor(() => expect(result.current.offered).not.toBeNull());

    act(() => result.current.install());

    await waitFor(() => expect(result.current.installing).toBe(true));
    expect(result.current.installFailed).toBe(false);
  });

  it("says nothing about success, because success is a restart", async () => {
    // There is no tick for this one. By the time the install resolves the
    // process is on its way out, and a "done" that flashed up on a window about
    // to be replaced would be for nobody.
    const update = newer("0.2.0");
    updater.checkForUpdate.mockResolvedValue(update);

    const { result } = mounted();
    await waitFor(() => expect(result.current.offered).not.toBeNull());

    act(() => result.current.install());

    await waitFor(() => expect(update.install).toHaveBeenCalled());
    await waitFor(() => expect(result.current.installing).toBe(false));
    expect(result.current.installFailed).toBe(false);
  });

  it("keeps the offer up and says so when the install fails", async () => {
    // A half-downloaded update is the one failure here worth interrupting for:
    // the user pressed a button and the app is still the old one.
    const update = newer("0.2.0");
    update.install.mockRejectedValue(new Error("could not write to disk"));
    updater.checkForUpdate.mockResolvedValue(update);

    const { result } = mounted();
    await waitFor(() => expect(result.current.offered).not.toBeNull());

    act(() => result.current.install());

    await waitFor(() => expect(result.current.installFailed).toBe(true));
    expect(result.current.offered).toEqual({ version: "0.2.0" });
    expect(result.current.installing).toBe(false);
  });
});

describe("the version on screen", () => {
  it("comes from the running build, never from a file the frontend can go stale against", async () => {
    const { result } = renderHook(() => useCurrentVersion(), { wrapper });

    await waitFor(() => expect(result.current.data).toBe("0.1.0"));
  });
});
