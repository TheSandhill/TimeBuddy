import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("../timer/notify", () => notify);

const { explainHiddenToTray } = await import("./hidden-notice");

const notice = {
  title: "TimeBuddy",
  body: "TimeBuddy draait door in het systeemvak.",
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  notify.notify.mockResolvedValue(undefined);
});

describe("explaining that close did not mean quit", () => {
  it("says it the first time — silence reads as a crash", async () => {
    await explainHiddenToTray(notice);

    expect(notify.notify).toHaveBeenCalledWith(notice.title, notice.body);
  });

  it("says it once, and never again", async () => {
    await explainHiddenToTray(notice);
    await explainHiddenToTray(notice);
    await explainHiddenToTray(notice);

    expect(notify.notify).toHaveBeenCalledTimes(1);
  });

  it("stays quiet across restarts, because it is remembered", async () => {
    await explainHiddenToTray(notice);
    vi.resetModules();

    const relaunched = await import("./hidden-notice");
    await relaunched.explainHiddenToTray(notice);

    expect(notify.notify).toHaveBeenCalledTimes(1);
  });

  it("would rather explain twice than not at all", async () => {
    // A webview with storage switched off. Nothing is remembered, so the
    // notice is repeated — which beats a window that vanishes in silence.
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });

    try {
      await explainHiddenToTray(notice);
      await explainHiddenToTray(notice);

      expect(notify.notify).toHaveBeenCalledTimes(2);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
