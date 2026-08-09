import { useTranslation } from "react-i18next";
import type { DateRange } from "../data/types";
import { fieldClass, labelClass } from "./field";

interface DateRangeFilterProps {
  range: DateRange;
  onChange: (range: DateRange) => void;
}

/**
 * Which days the list is about. Both ends are inclusive, which is what the
 * label says out loud — "tot en met" is a different question from "tot".
 */
export function DateRangeFilter({ range, onChange }: DateRangeFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className={labelClass}>
        {t("entries.from")}
        <input
          className={fieldClass}
          type="date"
          value={range.from}
          onChange={(event) => onChange({ ...range, from: event.target.value })}
        />
      </label>

      <label className={labelClass}>
        {t("entries.to")}
        <input
          className={fieldClass}
          type="date"
          value={range.to}
          onChange={(event) => onChange({ ...range, to: event.target.value })}
        />
      </label>
    </div>
  );
}
