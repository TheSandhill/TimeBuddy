# ADR-0006: Export to xlsx, not CSV

- **Status**: Accepted
- **Date**: 2026-08-09

## Context

The Reports screen answers "where did the hours go" on screen. Getting the detail behind those
totals out of the app — into an invoice, a mail to a client, a spreadsheet of someone else's
design — needs a file.

CSV is the obvious first answer, and it is the wrong one here. The one machine this app runs on is
a Dutch Windows laptop, and Dutch Excel:

- separates fields with `;`, not `,`, and only when the file matches its expectation;
- writes and reads `1,5` for one and a half, so a `1.5` in the file lands as text or as fifteen;
- reads `2026-08-04` as text unless the column happens to be set to a date.

The result is a file that opens as one column of strings, which someone then fixes by hand — every
week. Writing a CSV that guesses right means encoding a locale we would have to keep guessing at.

## Decision

Export a real `.xlsx` written by `rust_xlsxwriter`. One sheet, one row per Time Entry over the
range on screen, plus a total row.

Cells carry types rather than text:

- dates are Excel serial dates with the built-in **short date** format (index 14), which each
  reader renders in their own Windows locale;
- durations are decimal hours as numbers, formatted `0.00`, so Excel supplies the decimal comma.

No CSV is offered alongside it.

## Consequences

- The file is correct in Dutch Excel without knowing it is going there. Nothing in the code names a
  locale, a separator or a decimal comma.
- Sums, filters and pivots work on the exported columns, because they are numbers and dates rather
  than strings that look like them.
- The column headings come from the frontend as a `SheetLabels` payload. UI copy lives in the i18n
  catalogues, and a heading spelled in Rust would be the one hardcoded string
  `no-hardcoded-strings.test.ts` cannot see.
- The workbook is built into a buffer, not straight to disk, so a test can open it as the zip it is
  and check that 90 minutes really is the number `1.5`. That check is the whole reason for this
  decision, so it is worth a dev-dependency on `zip`.
- The path comes from the native save dialog (`tauri-plugin-dialog`, `dialog:allow-save`), which
  returns a path and not a file handle — Rust still writes every byte, and the frontend still
  touches no filesystem (ADR-0002).
- Durations are stored in minutes and converted to hours only in the sheet, at the edge. The total
  row is summed in minutes and converted once, so it is the total the report shows rather than the
  sum of rounded cells.
- `export_report` takes the **resolved range**, not the Period behind it. The screen resolved "this
  week" once already; resolving it a second time after the user has been looking at a save dialog
  would export a different week than the one they were reading if midnight passed in between.
- Anyone who genuinely wants CSV can save one from Excel, with Excel's own idea of what Dutch means.
