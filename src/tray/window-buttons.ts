/**
 * What the two titlebar buttons ask of the window.
 *
 * `decorations: false` (ADR-0004) means nothing native is left to press, so
 * these are it. Close asks to close and means it — whether that ends up hiding
 * the window in the tray is decided in Rust, in the one place every close
 * arrives at, Alt+F4 included.
 *
 * Imported lazily so a test — or a browser — can render the titlebar without a
 * Tauri runtime underneath it.
 */

async function currentWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function minimizeWindow(): Promise<void> {
  await (await currentWindow()).minimize();
}

export async function closeWindow(): Promise<void> {
  await (await currentWindow()).close();
}
