//! Exporting the hours behind a report to a real `.xlsx`.
//!
//! Deliberately not CSV: Dutch Excel writes `;` between fields and `,` inside
//! numbers, and every CSV that crosses that border arrives as one column of
//! text. A workbook carries its types, so a date is a date and an hour is a
//! number the reader can sum.
//!
//! The sheet is one row per time entry over the range on screen — the detail
//! behind the totals, not the totals themselves.

use std::path::PathBuf;

use chrono::NaiveDate;
use rust_xlsxwriter::{Format, Workbook};
use serde::Deserialize;
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result};
use crate::reports::DateRange;

const MINUTES_PER_HOUR: f64 = 60.0;

/// Excel's built-in short date format. An index rather than a format string on
/// purpose: built-in 14 is rendered in the reader's own Windows locale, so the
/// same file reads `04-08-2026` in Amsterdam and `8/4/2026` in New York.
const SHORT_DATE: u8 = 14;

/// Two decimals. Excel supplies the separator, which is why the file is right
/// in Dutch Excel without knowing it is going there.
const TWO_DECIMALS: &str = "0.00";

/// One exported line: a time entry with the names it is filed under.
#[derive(Debug, Clone, PartialEq, Eq, FromRow)]
pub struct SheetRow {
    pub date: NaiveDate,
    pub client: String,
    pub project: String,
    pub note: Option<String>,
    pub duration_minutes: i64,
}

/// The column headings, in the language the app is currently showing.
///
/// They come from the caller because UI copy lives in the i18n catalogues
/// (`src/i18n/locales/*.json`), never in Rust — a heading spelled here would be
/// the one hardcoded string `no-hardcoded-strings.test.ts` cannot see.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetLabels {
    pub sheet_name: String,
    pub date: String,
    pub client: String,
    pub project: String,
    pub note: String,
    pub hours: String,
    pub total: String,
}

const DATE: u16 = 0;
const CLIENT: u16 = 1;
const PROJECT: u16 = 2;
const NOTE: u16 = 3;
const HOURS: u16 = 4;

/// The entries behind a report, oldest first — a timesheet is read forwards.
///
/// Archived clients and projects are included for the same reason reports
/// include them: archiving hides something from the pickers, not from history.
pub async fn rows(pool: &SqlitePool, range: DateRange) -> Result<Vec<SheetRow>> {
    Ok(sqlx::query_as(
        "SELECT time_entries.date             AS date,
                clients.name                  AS client,
                projects.name                 AS project,
                time_entries.note             AS note,
                time_entries.duration_minutes AS duration_minutes
           FROM time_entries
           JOIN projects ON projects.id = time_entries.project_id
           JOIN clients  ON clients.id  = projects.client_id
          WHERE time_entries.date BETWEEN ? AND ?
       ORDER BY time_entries.date, time_entries.id",
    )
    .bind(range.from)
    .bind(range.to)
    .fetch_all(pool)
    .await?)
}

/// Minutes as the decimal hours a timesheet is read in.
///
/// The stored minutes stay the truth: this is the display rounding
/// (`CONTEXT.md`) and it happens here, at the edge, and nowhere else.
fn hours(minutes: i64) -> f64 {
    minutes as f64 / MINUTES_PER_HOUR
}

/// The workbook, as the bytes of an `.xlsx` file.
///
/// Built in memory rather than straight to disk so the sheet can be opened and
/// read back in a test — "the numbers are numbers" is the whole point of not
/// shipping a CSV, and it deserves to be checked.
pub fn build(entries: &[SheetRow], labels: &SheetLabels) -> Result<Vec<u8>> {
    let heading = Format::new().set_bold();
    let date = Format::new().set_num_format_index(SHORT_DATE);
    let decimal = Format::new().set_num_format(TWO_DECIMALS);
    let total = Format::new().set_bold().set_num_format(TWO_DECIMALS);

    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name(&labels.sheet_name)?;

    for (column, (heading_text, width)) in [
        (&labels.date, 12.0),
        (&labels.client, 24.0),
        (&labels.project, 24.0),
        (&labels.note, 40.0),
        (&labels.hours, 10.0),
    ]
    .into_iter()
    .enumerate()
    {
        let column = column as u16;
        sheet.set_column_width(column, width)?;
        sheet.write_with_format(0, column, heading_text, &heading)?;
    }

    for (index, entry) in entries.iter().enumerate() {
        // Row 0 is the headings, so the first entry lands on row 1.
        let row = index as u32 + 1;
        sheet.write_with_format(row, DATE, &entry.date, &date)?;
        sheet.write(row, CLIENT, &entry.client)?;
        sheet.write(row, PROJECT, &entry.project)?;
        sheet.write(row, NOTE, entry.note.as_deref().unwrap_or_default())?;
        sheet.write_with_format(row, HOURS, hours(entry.duration_minutes), &decimal)?;
    }

    // Summed in minutes and converted once, so the total is the one the report
    // shows rather than the sum of five rounded cells.
    let minutes: i64 = entries.iter().map(|entry| entry.duration_minutes).sum();
    let last = entries.len() as u32 + 1;
    sheet.write_with_format(last, NOTE, &labels.total, &heading)?;
    sheet.write_with_format(last, HOURS, hours(minutes), &total)?;

    Ok(workbook.save_to_buffer()?)
}

// -- Command layer ----------------------------------------------------------

/// Writes the entries to `path`, which the user has already chosen in the
/// native save dialog.
///
/// Takes the resolved range rather than the `Period` behind it. The report has
/// already been resolved once, on screen; resolving "this week" a second time
/// after the user has been staring at a save dialog would export a different
/// week than the one they were reading if midnight passed in between.
#[tauri::command]
pub async fn export_report(
    db: State<'_, Db>,
    path: PathBuf,
    from: NaiveDate,
    to: NaiveDate,
    labels: SheetLabels,
) -> Result<()> {
    let workbook = build(&rows(&db.0, DateRange::new(from, to)?).await?, &labels)?;

    std::fs::write(path, workbook).map_err(Error::export)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients;
    use crate::db::test_pool;
    use crate::projects;
    use crate::test_support::{day, now, today};
    use crate::time_entries::{self, NewTimeEntry, Source};
    use sqlx::SqlitePool;
    use std::io::{Cursor, Read};

    async fn log(pool: &SqlitePool, project_id: i64, date: &str, minutes: i64, note: Option<&str>) {
        time_entries::create(
            pool,
            NewTimeEntry {
                project_id,
                date: day(date),
                duration_minutes: minutes,
                note: note.map(str::to_owned),
                source: Source::Manual,
                start_at: None,
                end_at: None,
            },
            today(),
            now(),
        )
        .await
        .unwrap();
    }

    async fn a_project(pool: &SqlitePool, client: &str, project: &str) -> i64 {
        let client = clients::create(pool, client, None, now()).await.unwrap();
        projects::create(pool, client.id, project, None, now())
            .await
            .unwrap()
            .id
    }

    fn range(from: &str, to: &str) -> DateRange {
        DateRange::new(day(from), day(to)).unwrap()
    }

    fn labels() -> SheetLabels {
        SheetLabels {
            sheet_name: "Uren".into(),
            date: "Datum".into(),
            client: "Klant".into(),
            project: "Project".into(),
            note: "Notitie".into(),
            hours: "Uren".into(),
            total: "Totaal".into(),
        }
    }

    fn row(date: &str, client: &str, project: &str, minutes: i64) -> SheetRow {
        SheetRow {
            date: day(date),
            client: client.into(),
            project: project.into(),
            note: None,
            duration_minutes: minutes,
        }
    }

    /// The XML of a part inside the workbook, which is a zip archive.
    fn part(workbook: &[u8], name: &str) -> String {
        let mut archive = zip::ZipArchive::new(Cursor::new(workbook)).expect("a zip archive");
        let mut file = archive.by_name(name).expect("part is present");
        let mut xml = String::new();
        file.read_to_string(&mut xml).unwrap();
        xml
    }

    #[tokio::test]
    async fn every_entry_in_the_range_is_a_row_carrying_its_names() {
        let pool = test_pool().await;
        let website = a_project(&pool, "Acme", "Website").await;
        let elsewhere = a_project(&pool, "Other", "Elsewhere").await;

        log(&pool, website, "2026-07-31", 60, None).await;
        log(&pool, website, "2026-08-04", 90, Some("Kickoff")).await;
        log(&pool, elsewhere, "2026-08-03", 30, None).await;
        log(&pool, website, "2026-08-05", 15, None).await;

        let rows = rows(&pool, range("2026-08-01", "2026-08-04")).await.unwrap();

        assert_eq!(
            rows,
            [
                row("2026-08-03", "Other", "Elsewhere", 30),
                SheetRow {
                    note: Some("Kickoff".into()),
                    ..row("2026-08-04", "Acme", "Website", 90)
                },
            ],
            "oldest first, and only the days on screen"
        );
    }

    #[tokio::test]
    async fn hours_booked_to_an_archived_project_are_still_exported() {
        let pool = test_pool().await;
        let website = a_project(&pool, "Acme", "Website").await;
        log(&pool, website, "2026-08-04", 90, None).await;
        projects::archive(&pool, website, now()).await.unwrap();

        let rows = rows(&pool, range("2026-08-01", "2026-08-05")).await.unwrap();

        assert_eq!(rows.len(), 1, "archiving is not forgetting");
    }

    #[test]
    fn the_workbook_is_a_zip_excel_can_open() {
        let workbook = build(&[row("2026-08-04", "Acme", "Website", 90)], &labels()).unwrap();

        assert_eq!(&workbook[..2], b"PK", "an xlsx is a zip");
        assert!(part(&workbook, "xl/worksheets/sheet1.xml").contains("<row"));
    }

    #[test]
    fn hours_are_numbers_excel_can_add_up_rather_than_text() {
        // This is the whole reason for a workbook instead of a CSV: a cell
        // holding 1.5 is shown as "1,50" by Dutch Excel and summed by anyone.
        let workbook = build(
            &[
                row("2026-08-04", "Acme", "Website", 90),
                row("2026-08-05", "Acme", "Website", 60),
            ],
            &labels(),
        )
        .unwrap();

        let sheet = part(&workbook, "xl/worksheets/sheet1.xml");

        assert!(sheet.contains("<v>1.5</v>"), "90 minutes is an hour and a half");
        assert!(sheet.contains("<v>1</v>"));
    }

    #[test]
    fn dates_are_dates_rather_than_the_text_we_store_them_as() {
        let workbook = build(&[row("2026-08-04", "Acme", "Website", 90)], &labels()).unwrap();

        assert!(
            !part(&workbook, "xl/worksheets/sheet1.xml").contains("2026-08-04"),
            "an ISO string in the cell would sort and filter as text"
        );
    }

    #[test]
    fn the_sheet_ends_with_the_total_the_report_shows() {
        let workbook = build(
            &[
                row("2026-08-04", "Acme", "Website", 90),
                row("2026-08-05", "Acme", "Website", 60),
            ],
            &labels(),
        )
        .unwrap();

        assert!(part(&workbook, "xl/worksheets/sheet1.xml").contains("<v>2.5</v>"));
        assert!(part(&workbook, "xl/sharedStrings.xml").contains("Totaal"));
    }

    #[test]
    fn the_headings_are_the_ones_the_caller_handed_in() {
        // UI copy is Dutch and English and lives in the i18n catalogues. Rust
        // naming a column "Date" would be a hardcoded string in the one place
        // the lint cannot see it.
        let english = SheetLabels {
            date: "Date".into(),
            client: "Client".into(),
            ..labels()
        };

        let strings = part(
            &build(&[row("2026-08-04", "Acme", "Website", 90)], &english).unwrap(),
            "xl/sharedStrings.xml",
        );

        assert!(strings.contains("Date"));
        assert!(strings.contains("Client"));
        assert!(!strings.contains("Datum"));
    }

    #[test]
    fn an_empty_range_still_produces_a_workbook_with_its_headings() {
        // Nothing to export is an answer, not a failure.
        let workbook = build(&[], &labels()).unwrap();

        assert!(part(&workbook, "xl/sharedStrings.xml").contains("Klant"));
    }
}
