/**
 * Where the "remember me" token is kept between launches.
 *
 * `localStorage`, and only the token — never the password, which the app has
 * no reason to hold for longer than the keystroke that typed it. The token is
 * meaningless on its own: Rust stores its hash and the deadline, so the side
 * holding it is not the side deciding whether it still works (ADR-0003).
 *
 * Every access is wrapped. A webview with storage switched off should mean
 * "type your password each launch", not a screen that fails to render.
 */

const TOKEN_KEY = "timebuddy.session";

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Not remembered, so the next launch asks. That is the safe direction.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // The token would have been refused by Rust anyway.
  }
}
