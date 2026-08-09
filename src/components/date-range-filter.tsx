import { useTranslation } from "react-i18next";
import type { DateRange } from "../data/types";

interface DateRangeFilterProps {
  range: DateRange;
  onChange: (range: DateRange) => void;
}

const field = "rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink";
const label = "flex flex-col gap-1 text-xs uppercase tracking-widest text-ink-muted";

/**
 * Which days the list is about. Both ends are inclusive, which is what the
 * label says out loud — "tot en met" is a different question from "tot".
 */
export function DateRangeFilter({ range, onChange }: DateRangeFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className={label}>
        {t("entries.from")}
        <input
          className={field}
          type="date"
          value={range.from}
          onChange={(event) => onChange({ ...range, from: event.target.value })}
        />
      </label>

      <label className={label}>
        {t("entries.to")}
        <input
          className={field}
          type="date"
          value={range.to}
          onChange={(event) => onChange({ ...range, to: event.target.value })}
        />
      </label>
    </div>
  );
}
