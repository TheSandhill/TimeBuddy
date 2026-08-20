/**
 * A line reporting how something went, with the glyph that says which kind of
 * news it is.
 *
 * ADR-0014 draws the line between the three and it is not a matter of taste, so
 * it is drawn once here rather than at each of the eight call sites on the
 * Settings screen:
 *
 * - `success` / `error` are the same answer to a question somebody asked. The
 *   user pressed Save, Back up now, Prepare restore, Check again — and it either
 *   happened or it did not.
 * - `warning` is a condition nobody asked about: a backup folder gone behind, or
 *   what a restore would cost before anyone has committed to it. Nothing is
 *   outstanding, so it is read rather than announced — which is why this is the
 *   one tone with no live-region role.
 *
 * The role travels with the tone for the same reason the colour does: a
 * rejection nobody is told about is the same as one that did not happen.
 */

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type StatusTone = "success" | "warning" | "error";

const tones = {
  success: { glyph: "success", role: "status", ink: "text-ink-muted" },
  warning: { glyph: "warning", role: undefined, ink: "text-danger" },
  error: { glyph: "error", role: "alert", ink: "text-danger" },
} as const satisfies Record<
  StatusTone,
  { glyph: IconName; role: "status" | "alert" | undefined; ink: string }
>;

export function StatusLine({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  const { glyph, role, ink } = tones[tone];

  return (
    <p role={role} className={`glyph-label text-sm ${ink}`}>
      {/* `shrink-0` without exception: these lines wrap, and a glyph squeezed
          thin by a long sentence is the one that stops reading as its shape. */}
      <Icon name={glyph} className="size-4 shrink-0" />
      {children}
    </p>
  );
}
