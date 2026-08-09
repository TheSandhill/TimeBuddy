/**
 * One shape for both groupings.
 *
 * A report by client and a report by project answer the same question at two
 * zoom levels, and the screen draws them the same way. Flattening here means
 * the component never holds a union it has to narrow before it can render a
 * row.
 */

import type { ClientTotal, ProjectTotal, Report } from "../data/types";

export interface ReportRow {
  key: string;
  name: string;
  /** The client a project belongs to. `null` when the row *is* the client. */
  client: string | null;
  totalMinutes: number;
}

export function clientRows(report: Report<ClientTotal>): Report<ReportRow> {
  return {
    ...report,
    rows: report.rows.map((row) => ({
      key: `client-${row.clientId}`,
      name: row.clientName,
      client: null,
      totalMinutes: row.totalMinutes,
    })),
  };
}

export function projectRows(report: Report<ProjectTotal>): Report<ReportRow> {
  return {
    ...report,
    rows: report.rows.map((row) => ({
      key: `project-${row.projectId}`,
      name: row.projectName,
      client: row.clientName,
      totalMinutes: row.totalMinutes,
    })),
  };
}
