/**
 * The Reports screen — where the hours turn into an answer.
 *
 * This is the part of the app worth keeping, and the part where a silent bug
 * costs real money, so it computes nothing: the period presets, the totals and
 * the exported sheet all come from Rust. The screen chooses a period and a
 * grouping, and shows what comes back.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { primaryButtonClass } from "../components/button";
import { DateRangeFilter } from "../components/date-range-filter";
import {
  exportReport,
  reportByClient,
  reportByProject,
} from "../data/commands";
import { errorKey } from "../data/error-message";
import type {
  DateRange,
  Period,
  PresetName,
  Report,
  SheetLabels,
} from "../data/types";
import { formatDuration } from "../entries/duration";
import { rangeLabel } from "../reports/range-label";
import { clientRows, projectRows, type ReportRow } from "../reports/rows";

/** Which totals are on screen: one row per client, or one per project. */
type Grouping = "client" | "project";

const presets: PresetName[] = [
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
];

const buttonClass =
  "rounded-md border border-border px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink";
const chosenClass =
  "rounded-md border border-accent px-3 py-1.5 text-sm text-accent";

const chip = (chosen: boolean) => (chosen ? chosenClass : buttonClass);

export function Reports() {
  const { t, i18n } = useTranslation();

  const [period, setPeriod] = useState<Period>({ preset: "thisWeek" });
  const [grouping, setGrouping] = useState<Grouping>("client");
  const [exportError, setExportError] = useState<string | null>(null);

  const custom = period.preset === "custom" ? period : null;
  const backwards = custom !== null && custom.from > custom.to;

  const report = useQuery<Report<ReportRow>>({
    queryKey: ["report", grouping, period],
    queryFn: async () =>
      grouping === "client"
        ? clientRows(await reportByClient(period))
        : projectRows(await reportByProject(period)),
    enabled: !backwards,
  });

  /** The headings the sheet is written with, in the language on screen. */
  const sheetLabels = (): SheetLabels => ({
    sheetName: t("reports.sheetName"),
    date: t("reports.columnDate"),
    client: t("reports.columnClient"),
    project: t("reports.columnProject"),
    note: t("reports.columnNote"),
    hours: t("reports.columnHours"),
    total: t("reports.total"),
  });

  const exporting = useMutation({
    mutationFn: async (range: DateRange) => {
      const path = await save({
        defaultPath: t("reports.fileName", { from: range.from, to: range.to }),
        filters: [{ name: t("reports.excelFile"), extensions: ["xlsx"] }],
      });
      // A dismissed dialog is an answer, not a failure: write nothing.
      if (path === null) {
        return;
      }
      // The same range that named the file and drew the totals, so the three
      // cannot disagree even if the dialog stood open across midnight.
      await exportReport(path, range, sheetLabels());
    },
    onSuccess: () => setExportError(null),
    onError: (error) => setExportError(t(errorKey(error))),
  });

  /**
   * Switching to a custom period starts from the range already on screen, so
   * the two date fields open on the days the reader was just looking at.
   */
  const pickCustom = (range: DateRange) =>
    setPeriod({ preset: "custom", ...range });

  const shown = report.data;
  const rows = shown?.rows ?? [];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={period.preset === preset}
              onClick={() => setPeriod({ preset })}
              className={chip(period.preset === preset)}
            >
              {t(`reports.${preset}`)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={custom !== null}
            // Without a report there is no range to start from, and inventing
            // one in JavaScript is the drift this screen exists to avoid.
            disabled={!shown}
            onClick={() => shown && pickCustom(shown.range)}
            className={chip(custom !== null)}
          >
            {t("reports.custom")}
          </button>
        </div>

        {custom ? (
          <DateRangeFilter range={custom} onChange={pickCustom} />
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg text-ink">
              {shown ? rangeLabel(shown.range, i18n.language) : null}
            </h2>
            {shown?.isoWeek ? (
              <p className="text-xs uppercase tracking-widest text-ink-muted">
                {t("reports.week", {
                  week: shown.isoWeek.week,
                  year: shown.isoWeek.year,
                })}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={grouping === "client"}
              onClick={() => setGrouping("client")}
              className={chip(grouping === "client")}
            >
              {t("reports.byClient")}
            </button>
            <button
              type="button"
              aria-pressed={grouping === "project"}
              onClick={() => setGrouping("project")}
              className={chip(grouping === "project")}
            >
              {t("reports.byProject")}
            </button>

            <button
              type="button"
              disabled={!shown || exporting.isPending}
              onClick={() => shown && exporting.mutate(shown.range)}
              className={primaryButtonClass}
            >
              {exporting.isPending ? t("reports.exporting") : t("reports.export")}
            </button>
          </div>
        </div>
      </header>

      {backwards ? (
        <p role="alert" className="text-sm text-danger">
          {t("error.rangeEndsBeforeStart")}
        </p>
      ) : null}

      {exportError ? (
        <p role="alert" className="text-sm text-danger">
          {exportError}
        </p>
      ) : null}

      {shown && rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("reports.empty")}</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-baseline justify-between gap-4 py-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-ink">{row.name}</span>
                  {row.client ? (
                    <span className="truncate text-xs text-ink-muted">
                      {row.client}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-sm text-ink">
                  {formatDuration(row.totalMinutes)}
                </span>
              </li>
            ))}
          </ul>

          <p className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
            <span className="text-xs uppercase tracking-widest text-ink-muted">
              {t("reports.total")}
            </span>
            <span className="text-lg tabular-nums text-ink">
              {formatDuration(shown?.totalMinutes ?? 0)}
            </span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
