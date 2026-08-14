/**
 * The last thing standing between a render fault and a blank window.
 *
 * The window has no decorations (ADR-0004), so when React unmounts the tree
 * there is nothing left at all: no titlebar to drag, no message, no clue — just
 * the theme's background colour. It has happened twice, once after the first-run
 * wizard and once after a restore, and both times the symptom was "the app shows
 * nothing" rather than anything that pointed at a cause.
 *
 * So this deliberately depends on **as little as possible**. It is a class
 * component, because that is the only thing that can catch a render error, and
 * beyond React it uses:
 *
 * - the catalogues, imported as JSON rather than read through i18next — a crash
 *   screen must not need the i18n runtime it may be reporting the failure of, and
 *   importing the same files keeps the wording where the parity test can see it;
 * - `document.documentElement.lang`, set before the first render;
 * - `data-tauri-drag-region`, which is a DOM attribute the webview reads.
 *
 * No hooks, no providers, no commands. Whatever broke, this can still draw.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import en from "../i18n/locales/en.json";
import nl from "../i18n/locales/nl.json";

interface Props {
  children: ReactNode;
}

interface State {
  /** The message to show, or `null` while everything is fine. */
  problem: string | null;
}

/**
 * The crash wording, straight out of the catalogues.
 *
 * Chosen off the `lang` attribute rather than the i18next instance, so a failure
 * to initialise i18next still gets a screen in the right language.
 */
function copy() {
  return document.documentElement.lang === "en" ? en.crash : nl.crash;
}

export class RootBoundary extends Component<Props, State> {
  state: State = { problem: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      problem: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // The console is the only log this app has, and the component stack is what
    // makes a one-line message locatable.
    console.error("TimeBuddy could not render", error, info.componentStack);
  }

  render() {
    if (this.state.problem === null) {
      return this.props.children;
    }

    const words = copy();

    return (
      <div className="flex h-screen flex-col bg-surface">
        {/*
          The window cannot be dragged otherwise: its own titlebar is part of what
          just failed to render. Alt+F4 still reaches Rust, which hides to the
          tray — so the tray menu remains the way out, as it always is.
        */}
        <div
          data-tauri-drag-region
          className="h-10 shrink-0 border-b border-border bg-surface-raised"
        />

        <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <div
            role="alert"
            className="flex max-w-md flex-col gap-3 rounded-lg border border-danger bg-surface-raised p-5"
          >
            <p className="text-sm font-medium text-danger">{words.title}</p>
            <p className="text-sm text-ink-muted">{words.hint}</p>

            <details className="text-xs text-ink-muted">
              <summary className="cursor-pointer">{words.detail}</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">
                {this.state.problem}
              </pre>
            </details>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="self-start rounded-md border border-border px-3 py-1.5 text-sm text-ink-muted transition-colors motion-quick hover:text-ink"
            >
              {words.reload}
            </button>
          </div>
        </main>
      </div>
    );
  }
}
