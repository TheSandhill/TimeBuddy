import { useTranslation } from "react-i18next";
import { momentLabel } from "../backup/moment-label";
import type { Instant } from "../data/types";
import { Icon } from "./icon";

/**
 * Why the app is asking for a password it was not asking for yesterday.
 *
 * The account row travels with the database (ADR-0003), so a restore brings the
 * password from the day the backup was made — and a "remember me" session issued
 * by a database that is no longer here stops working. That re-lock is correct and
 * completely baffling unless it is explained, so it is explained on the screen
 * doing the asking (ADR-0008).
 */
export function RestoreNotice({ restoredFrom }: { restoredFrom: Instant }) {
  const { t, i18n } = useTranslation();

  return (
    <div
      role="status"
      className="mx-auto mb-6 flex max-w-sm items-start gap-2.5 rounded-lg bg-surface-raised px-4 py-3"
    >
      {/* The restore was asked for and it happened, so `success` (ADR-0014).
          Not `glyph-label`: the gap here is a card's, between a glyph and two
          paragraphs, rather than a label's. Only the nudge is shared — the same
          one px that utility applies, so the glyph meets the first line the way
          it does everywhere else. */}
      <Icon name="success" className="mt-px size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-ink">
          {t("restore.doneFrom", {
            when: momentLabel(restoredFrom, i18n.language),
          })}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {t("restore.passwordIsFromThen")}
        </p>
      </div>
    </div>
  );
}
