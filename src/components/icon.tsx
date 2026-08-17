/**
 * The icon set (ADR-0014).
 *
 * Phosphor, bold weight, and the weight is the reason: at a 256 grid its stroke
 * is 24 units, which is 2.25px once an icon is drawn at 24px — within a hair of
 * the 1.25-in-a-12-box the hand-drawn glyphs used, so the set slots in at the
 * weight the app already had. Rounded terminals and open counters are the same
 * thing Nunito was chosen for, so the glyphs and the type read as one voice.
 *
 * The paths are **fills, not strokes**: bold Phosphor ships pre-outlined, which
 * is why there is no `strokeWidth` here and why a glyph scales without its line
 * thickening. `currentColor` still does the work it always did — a button's own
 * hover carries its glyph, and no icon names a colour of its own, so ADR-0004's
 * rule against raw hexes holds without an exception for artwork.
 *
 * Names are what a glyph *means* here, not what it depicts: `clients` rather
 * than `user-list`. A screen asking for `clients` keeps asking the right
 * question when the artwork is swapped underneath it.
 */
type Glyph = string | { d: string }[];

const paths = {
  timer:
    "M128 44a96 96 0 1 0 96 96a96.11 96.11 0 0 0-96-96m0 168a72 72 0 1 1 72-72a72.08 72.08 0 0 1-72 72m36.49-112.49a12 12 0 0 1 0 17l-28 28a12 12 0 0 1-17-17l28-28a12 12 0 0 1 17 0M92 16a12 12 0 0 1 12-12h48a12 12 0 0 1 0 24h-48a12 12 0 0 1-12-12",
  entries:
    "M228 128a12 12 0 0 1-12 12H116a12 12 0 0 1 0-24h100a12 12 0 0 1 12 12M116 76h100a12 12 0 0 0 0-24H116a12 12 0 0 0 0 24m100 104H116a12 12 0 0 0 0 24h100a12 12 0 0 0 0-24M44 59.31V104a12 12 0 0 0 24 0V40a12 12 0 0 0-17.36-10.73l-16 8a12 12 0 0 0 9.36 22Zm39.73 96.86a27.7 27.7 0 0 0-11.2-18.63A28.89 28.89 0 0 0 32.9 143a27.7 27.7 0 0 0-4.17 7.54a12 12 0 0 0 22.55 8.21a4 4 0 0 1 .58-1a4.78 4.78 0 0 1 6.5-.82a3.82 3.82 0 0 1 1.61 2.6a3.63 3.63 0 0 1-.77 2.77l-.13.17l-28.68 38.35A12 12 0 0 0 40 220h32a12 12 0 0 0 0-24h-8l14.28-19.11a27.48 27.48 0 0 0 5.45-20.72",
  clients:
    "M152 80a12 12 0 0 1 12-12h80a12 12 0 0 1 0 24h-80a12 12 0 0 1-12-12m92 36h-80a12 12 0 0 0 0 24h80a12 12 0 0 0 0-24m0 48h-56a12 12 0 0 0 0 24h56a12 12 0 0 0 0-24m-88.38 25a12 12 0 1 1-23.24 6c-5.72-22.23-28.24-39-52.38-39s-46.66 16.76-52.38 39a12 12 0 1 1-23.24-6c5.38-20.9 20.09-38.16 39.11-48a52 52 0 1 1 73 0c19.04 9.85 33.75 27.11 39.13 48M80 132a28 28 0 1 0-28-28a28 28 0 0 0 28 28",
  reports:
    "M224 196h-4V40a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v36H96a12 12 0 0 0-12 12v36H48a12 12 0 0 0-12 12v60h-4a12 12 0 0 0 0 24h192a12 12 0 0 0 0-24M164 52h32v144h-32Zm-56 48h32v96h-32Zm-48 48h24v48H60Z",

  // Row actions. `rename` serves both the Clients rows and an entry, because
  // they are the same act; `delete` exists for entries alone — the Clients
  // screen has no delete anywhere, by design, and must not grow one.
  more: "M156 128a28 28 0 1 1-28-28a28 28 0 0 1 28 28M48 100a28 28 0 1 0 28 28a28 28 0 0 0-28-28m160 0a28 28 0 1 0 28 28a28 28 0 0 0-28-28",
  rename:
    "m230.14 70.54l-44.68-44.69a20 20 0 0 0-28.29 0L33.86 149.17A19.85 19.85 0 0 0 28 163.31V208a20 20 0 0 0 20 20h44.69a19.86 19.86 0 0 0 14.14-5.86L230.14 98.82a20 20 0 0 0 0-28.28M93 180l71-71l11 11l-71 71Zm-17-17l-11-11l71-71l11 11Zm-24 10l15.51 15.51L83 204H52Zm140-70l-39-39l18.34-18.34l39 39Z",
  archive:
    "M224 44H32a20 20 0 0 0-20 20v24a20 20 0 0 0 16 19.6V192a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20v-84.4A20 20 0 0 0 244 88V64a20 20 0 0 0-20-20M36 68h184v16H36Zm16 120v-80h152v80Zm112-52a12 12 0 0 1-12 12h-48a12 12 0 0 1 0-24h48a12 12 0 0 1 12 12",
  unarchive:
    "m226.73 66.63l-16-32A12 12 0 0 0 200 28H56a12 12 0 0 0-10.73 6.63l-16 32A12 12 0 0 0 28 72v136a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V72a12 12 0 0 0-1.27-5.37M192.58 52l6 12H57.42l6-12ZM52 204V88h152v116Zm116.49-68.49a12 12 0 0 1-17 17L140 141v39a12 12 0 0 1-24 0v-39l-11.51 11.52a12 12 0 0 1-17-17l32-32a12 12 0 0 1 17 0Z",
  add: "M228 128a12 12 0 0 1-12 12h-76v76a12 12 0 0 1-24 0v-76H40a12 12 0 0 1 0-24h76V40a12 12 0 0 1 24 0v76h76a12 12 0 0 1 12 12",
  save: "M219.31 72L184 36.69A15.86 15.86 0 0 0 172.69 32H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V83.31A15.86 15.86 0 0 0 219.31 72M208 208h-24v-56a16 16 0 0 0-16-16H88a16 16 0 0 0-16 16v56H48V48h124.69L208 83.31ZM160 72a8 8 0 0 1-8 8H96a8 8 0 0 1 0-16h56a8 8 0 0 1 8 8",
  delete:
    "M216 48h-36V36a28 28 0 0 0-28-28h-48a28 28 0 0 0-28 28v12H40a12 12 0 0 0 0 24h4v136a20 20 0 0 0 20 20h128a20 20 0 0 0 20-20V72h4a12 12 0 0 0 0-24M100 36a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v12h-56Zm88 168H68V72h120Zm-72-100v64a12 12 0 0 1-24 0v-64a12 12 0 0 1 24 0m48 0v64a12 12 0 0 1-24 0v-64a12 12 0 0 1 24 0",

  // Disclosure. The chevron points up and is turned by the caller, so an
  // accordion animates one glyph rather than swapping two.
  chevron:
    "M216.49 168.49a12 12 0 0 1-17 0L128 97l-71.51 71.49a12 12 0 0 1-17-17l80-80a12 12 0 0 1 17 0l80 80a12 12 0 0 1 0 17",
  close:
    "M208.49 191.51a12 12 0 0 1-17 17L128 145l-63.51 63.49a12 12 0 0 1-17-17L111 128L47.51 64.49a12 12 0 0 1 17-17L128 111l63.51-63.52a12 12 0 0 1 17 17L145 128Z",

  // Transport. Solid rather than bold: a play triangle drawn as an outline
  // reads as a button waiting to be pressed twice.
  play: "M240 128a15.74 15.74 0 0 1-7.6 13.51L88.32 229.65a16 16 0 0 1-16.2.3A15.86 15.86 0 0 1 64 216.13V39.87a15.86 15.86 0 0 1 8.12-13.82a16 16 0 0 1 16.2.3l144.08 88.14A15.74 15.74 0 0 1 240 128",
  pause:
    "M216 48v160a16 16 0 0 1-16 16h-40a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h40a16 16 0 0 1 16 16M96 32H56a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h40a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16",
  stop: "M216 56v144a16 16 0 0 1-16 16H56a16 16 0 0 1-16-16V56a16 16 0 0 1 16-16h144a16 16 0 0 1 16 16",

  // The status vocabulary. Every alert in the app was red text and every
  // confirmation a bare word; these are what give them a shape.
  //
  // `success` and `error` are the same circle carrying a different mark, so the
  // pair reads as one answer to one question. `error` being a cross *in a
  // circle* rather than a bare cross also keeps it away from `close` — a bare
  // cross beside a red message reads as "dismiss this" and gets clicked.
  success:
    "M176.49 95.51a12 12 0 0 1 0 17l-56 56a12 12 0 0 1-17 0l-24-24a12 12 0 1 1 17-17L112 143l47.51-47.52a12 12 0 0 1 16.98.03M236 128A108 108 0 1 1 128 20a108.12 108.12 0 0 1 108 108m-24 0a84 84 0 1 0-84 84a84.09 84.09 0 0 0 84-84",
  error:
    "M168.49 104.49L145 128l23.52 23.51a12 12 0 0 1-17 17L128 145l-23.51 23.52a12 12 0 0 1-17-17L111 128l-23.49-23.51a12 12 0 0 1 17-17L128 111l23.51-23.52a12 12 0 0 1 17 17ZM236 128A108 108 0 1 1 128 20a108.12 108.12 0 0 1 108 108m-24 0a84 84 0 1 0-84 84a84.09 84.09 0 0 0 84-84",

  /**
   * The one composite: the set ships no triangle-with-exclamation, so it is
   * assembled from the triangle plus an exclamation drawn to fit inside it.
   *
   * The exclamation is **authored at final size rather than scaled down**. The
   * obvious way round — take the standalone exclamation and shrink it — thins
   * its stroke by whatever the scale factor is, so it arrives lighter than the
   * triangle holding it and the glyph reads as two weights. Drawn here instead
   * with a stem a full 24 units wide, which is bold Phosphor's stroke, so it
   * matches the triangle and every other glyph in the set.
   *
   * It sits low on purpose: a triangle's visual centre is below its geometric
   * one, which is where Phosphor's own `warning` puts it too.
   */
  warning: [
    {
      d: "M240.26 186.1L152.81 34.23a28.74 28.74 0 0 0-49.62 0L15.74 186.1a27.45 27.45 0 0 0 0 27.71A28.31 28.31 0 0 0 40.55 228h174.9a28.31 28.31 0 0 0 24.79-14.19a27.45 27.45 0 0 0 .02-27.71m-20.8 15.7a4.46 4.46 0 0 1-4 2.2H40.55a4.46 4.46 0 0 1-4-2.2a3.56 3.56 0 0 1 0-3.73L124 46.2a4.75 4.75 0 0 1 8 0l87.45 151.87a3.56 3.56 0 0 1 .01 3.73",
    },
    {
      d: "M128 84a12 12 0 0 1 12 12v36a12 12 0 0 1-24 0v-36a12 12 0 0 1 12-12M145 172a17 17 0 1 1-34 0a17 17 0 0 1 34 0",
    },
  ],

  // The Settings groups (#58). `data` is the sync pair and `restore` the clock
  // wound backwards: restoring is not syncing, and the group heading must not
  // look like the dangerous control sitting inside it.
  appearance:
    "M203.57 51A107.9 107.9 0 0 0 20 128c0 44.72 27.6 82.25 72 97.94A36 36 0 0 0 140 192a12 12 0 0 1 12-12h46.21a35.79 35.79 0 0 0 35.1-28a108.6 108.6 0 0 0 2.69-24.91A107.23 107.23 0 0 0 203.57 51m6.34 95.67a11.91 11.91 0 0 1-11.7 9.3H152a36 36 0 0 0-36 36a12 12 0 0 1-16 11.3c-16.65-5.88-30.65-15.76-40.48-28.56A76 76 0 0 1 44 128a84 84 0 0 1 83.13-84h.87a84.35 84.35 0 0 1 84 83.29a84.7 84.7 0 0 1-2.09 19.42ZM144 76a16 16 0 1 1-16-16a16 16 0 0 1 16 16m-44 24a16 16 0 1 1-16-16a16 16 0 0 1 16 16m0 56a16 16 0 1 1-16-16a16 16 0 0 1 16 16m88-56a16 16 0 1 1-16-16a16 16 0 0 1 16 16",
  system:
    "M208 36H48a28 28 0 0 0-28 28v112a28 28 0 0 0 28 28h160a28 28 0 0 0 28-28V64a28 28 0 0 0-28-28m4 140a4 4 0 0 1-4 4H48a4 4 0 0 1-4-4V64a4 4 0 0 1 4-4h160a4 4 0 0 1 4 4Zm-40 52a12 12 0 0 1-12 12H96a12 12 0 0 1 0-24h64a12 12 0 0 1 12 12",
  data: "M228 48v48a12 12 0 0 1-12 12h-48a12 12 0 0 1 0-24h19l-7.8-7.8a75.55 75.55 0 0 0-53.32-22.26h-.43a75.5 75.5 0 0 0-53.06 21.63a12 12 0 1 1-16.78-17.16a99.38 99.38 0 0 1 69.87-28.47h.52a99.42 99.42 0 0 1 70.2 29.29L204 67V48a12 12 0 0 1 24 0m-44.39 132.43a75.5 75.5 0 0 1-53.09 21.63h-.43a75.55 75.55 0 0 1-53.32-22.26L69 172h19a12 12 0 0 0 0-24H40a12 12 0 0 0-12 12v48a12 12 0 0 0 24 0v-19l7.8 7.8a99.42 99.42 0 0 0 70.2 29.26h.56a99.38 99.38 0 0 0 69.87-28.47a12 12 0 0 0-16.78-17.16Z",
  restore:
    "M140 80v41.21l34.17 20.5a12 12 0 1 1-12.34 20.58l-40-24A12 12 0 0 1 116 128V80a12 12 0 0 1 24 0m-12-52a99.38 99.38 0 0 0-70.76 29.34c-4.69 4.74-9 9.37-13.24 14V64a12 12 0 0 0-24 0v40a12 12 0 0 0 12 12h40a12 12 0 0 0 0-24H57.77c5.23-6 10.6-11.78 16.49-17.74a76 76 0 1 1 1.58 109a12 12 0 0 0-16.48 17.46A100 100 0 1 0 128 28",
  verified:
    "M228.75 100.05c-3.52-3.67-7.15-7.46-8.34-10.33c-1.06-2.56-1.14-7.83-1.21-12.47c-.15-10-.34-22.44-9.18-31.27s-21.27-9-31.27-9.18c-4.64-.07-9.91-.15-12.47-1.21c-2.87-1.19-6.66-4.82-10.33-8.34C148.87 20.46 140.05 12 128 12s-20.87 8.46-27.95 15.25c-3.67 3.52-7.46 7.15-10.33 8.34c-2.56 1.06-7.83 1.14-12.47 1.21c-10 .2-22.44.34-31.25 9.2s-9 21.25-9.2 31.25c-.07 4.64-.15 9.91-1.21 12.47c-1.19 2.87-4.82 6.66-8.34 10.33C20.46 107.13 12 116 12 128s8.46 20.87 15.25 28c3.52 3.67 7.15 7.46 8.34 10.33c1.06 2.56 1.14 7.83 1.21 12.47c.15 10 .34 22.44 9.18 31.27s21.27 9 31.27 9.18c4.64.07 9.91.15 12.47 1.21c2.87 1.19 6.66 4.82 10.33 8.34C107.13 235.54 116 244 128 244s20.87-8.46 27.95-15.25c3.67-3.52 7.46-7.15 10.33-8.34c2.56-1.06 7.83-1.14 12.47-1.21c10-.15 22.44-.34 31.27-9.18s9-21.27 9.18-31.27c.07-4.64.15-9.91 1.21-12.47c1.19-2.87 4.82-6.66 8.34-10.33c6.79-7.08 15.25-15.9 15.25-27.95s-8.46-20.87-15.25-27.95m-17.32 39.29c-4.82 5-10.28 10.72-13.19 17.76c-2.82 6.8-2.93 14.16-3 21.29c-.08 5.36-.19 12.71-2.15 14.66s-9.3 2.07-14.66 2.15c-7.13.11-14.49.22-21.29 3c-7 2.91-12.73 8.37-17.76 13.19c-3.6 3.45-8.98 8.61-11.38 8.61s-7.78-5.16-11.34-8.57c-5-4.82-10.72-10.28-17.76-13.19c-6.8-2.82-14.16-2.93-21.29-3c-5.36-.08-12.71-.19-14.66-2.15s-2.07-9.3-2.15-14.66c-.11-7.13-.22-14.49-3-21.29c-2.91-7-8.37-12.73-13.19-17.76C41.16 135.78 36 130.4 36 128s5.16-7.78 8.57-11.34c4.82-5 10.28-10.72 13.19-17.76c2.82-6.8 2.93-14.16 3-21.29C60.88 72.25 61 64.9 63 63s9.3-2.07 14.66-2.15c7.13-.11 14.49-.22 21.29-3c7-2.91 12.73-8.37 17.76-13.19C120.22 41.16 125.6 36 128 36s7.78 5.16 11.34 8.57c5 4.82 10.72 10.28 17.76 13.19c6.8 2.82 14.16 2.93 21.29 3c5.36.08 12.71.19 14.66 2.15s2.07 9.3 2.15 14.66c.11 7.13.22 14.49 3 21.29c2.91 7 8.37 12.73 13.19 17.76c3.41 3.56 8.57 8.94 8.57 11.34s-5.12 7.82-8.53 11.38m-34.94-43.83a12 12 0 0 1 0 17l-56 56a12 12 0 0 1-17 0l-24-24a12 12 0 1 1 17-17L112 143l47.51-47.52a12 12 0 0 1 16.98.03",

  settings:
    "M128 76a52 52 0 1 0 52 52a52.06 52.06 0 0 0-52-52m0 80a28 28 0 1 1 28-28a28 28 0 0 1-28 28m92-27.21v-1.58l14-17.51a12 12 0 0 0 2.23-10.59A111.8 111.8 0 0 0 225 71.89a12 12 0 0 0-9.11-5.89l-22.28-2.5l-1.11-1.11L190 40.1a12 12 0 0 0-5.89-9.1a111.7 111.7 0 0 0-27.23-11.27A12 12 0 0 0 146.3 22l-17.51 14h-1.58L109.7 22a12 12 0 0 0-10.59-2.23a111.8 111.8 0 0 0-27.22 11.28A12 12 0 0 0 66 40.11l-2.5 22.28l-1.11 1.11L40.1 66a12 12 0 0 0-9.1 5.89a111.7 111.7 0 0 0-11.23 27.23A12 12 0 0 0 22 109.7l14 17.51v1.58L22 146.3a12 12 0 0 0-2.23 10.59a111.8 111.8 0 0 0 11.29 27.22a12 12 0 0 0 9.05 5.89l22.28 2.48l1.11 1.11L66 215.9a12 12 0 0 0 5.89 9.1a111.7 111.7 0 0 0 27.23 11.27A12 12 0 0 0 109.7 234l17.51-14h1.58l17.51 14a12 12 0 0 0 10.59 2.23A111.8 111.8 0 0 0 184.11 225a12 12 0 0 0 5.91-9.06l2.48-22.28l1.11-1.11L215.9 190a12 12 0 0 0 9.06-5.91a111.7 111.7 0 0 0 11.27-27.23A12 12 0 0 0 234 146.3Zm-24.12-4.89a70 70 0 0 1 0 8.2a12 12 0 0 0 2.61 8.22l12.84 16.05a86.5 86.5 0 0 1-4.33 10.49l-20.43 2.27a12 12 0 0 0-7.65 4a69 69 0 0 1-5.8 5.8a12 12 0 0 0-4 7.65L166.86 207a86.5 86.5 0 0 1-10.49 4.35l-16.05-12.85a12 12 0 0 0-7.5-2.62h-.72a70 70 0 0 1-8.2 0a12.06 12.06 0 0 0-8.22 2.6l-16.05 12.85A86.5 86.5 0 0 1 89.14 207l-2.27-20.43a12 12 0 0 0-4-7.65a69 69 0 0 1-5.8-5.8a12 12 0 0 0-7.65-4L49 166.86a86.5 86.5 0 0 1-4.35-10.49l12.84-16.05a12 12 0 0 0 2.61-8.22a70 70 0 0 1 0-8.2a12 12 0 0 0-2.61-8.22L44.67 99.63A86.5 86.5 0 0 1 49 89.14l20.43-2.27a12 12 0 0 0 7.65-4a69 69 0 0 1 5.8-5.8a12 12 0 0 0 4-7.65L89.14 49a86.5 86.5 0 0 1 10.49-4.35l16.05 12.85a12.06 12.06 0 0 0 8.22 2.6a70 70 0 0 1 8.2 0a12 12 0 0 0 8.22-2.6l16.05-12.85A86.5 86.5 0 0 1 166.86 49l2.27 20.43a12 12 0 0 0 4 7.65a69 69 0 0 1 5.8 5.8a12 12 0 0 0 7.65 4L207 89.14a86.5 86.5 0 0 1 4.35 10.49l-12.84 16.05a12 12 0 0 0-2.63 8.22",
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof paths;

export const ICON_NAMES = Object.keys(paths) as IconName[];

/** Most glyphs are one path. The array form is for the assembled ones. */
const shapesOf = (glyph: Glyph) =>
  typeof glyph === "string" ? [{ d: glyph }] : glyph;

/**
 * `aria-hidden` without exception: every control that carries a glyph already
 * has its own name, and a glyph that announced itself would give the control
 * two. There is deliberately no way to pass a label in — an icon that has to
 * speak is a control missing an `aria-label`, and that is the bug to fix.
 *
 * The size is a class rather than a prop so a glyph sizes the way everything
 * else on the screen does. `size-4` is the tab bar's, and the common case.
 */
export function Icon({
  name,
  className = "size-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      {shapesOf(paths[name]).map((shape) => (
        <path key={shape.d} d={shape.d} />
      ))}
    </svg>
  );
}

/*
 * The two that move.
 *
 * They are not in `paths` and are not Phosphor: they came from a spinner set, on
 * a 24 grid rather than 256, and they are the only glyphs whose meaning is a
 * loop rather than a shape. Keeping them out of the record is what lets every
 * name in it stay a static, single-viewBox fill.
 *
 * Both arrived animating themselves, with SMIL `<animate>` elements. SMIL does
 * not read CSS, so those glyphs would have kept moving through High-contrast's
 * `--animate-*: none` and through `prefers-reduced-motion` alike — a second
 * motion code path, which is the thing ADR-0004 exists to prevent. The artwork
 * is unchanged; only the engine is, and it is now the theme's.
 *
 * Each is built so that stopping the loop costs the pleasure and not the
 * message (ADR-0004: no state is signalled by motion alone).
 */

/**
 * Busy. Turning is the pleasure; the button beside this one still swaps its word
 * to "Saving…", and with the loop off what is left is a ring rather than
 * nothing.
 *
 * The whole element turns rather than the arc inside it — the track is a full
 * circle, so rotating it is invisible, and it saves fighting `transform-box` on
 * an SVG child.
 */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden="true"
      fill="currentColor"
    >
      <path
        opacity="0.25"
        d="M12 1A11 11 0 1 0 23 12A11 11 0 0 0 12 1Zm0 19a8 8 0 1 1 8-8A8 8 0 0 1 12 20Z"
      />
      <path d="M10.72 19.9a8 8 0 0 1-6.5-9.79A7.77 7.77 0 0 1 10.4 4.16a8 8 0 0 1 9.49 6.52A1.54 1.54 0 0 0 21.38 12h.13a1.37 1.37 0 0 0 1.38-1.54a11 11 0 1 0-12.7 12.39A1.54 1.54 0 0 0 12 21.34h0A1.47 1.47 0 0 0 10.72 19.9Z" />
    </svg>
  );
}

/**
 * A block is running.
 *
 * The dot is the state and never moves; the ring is the pleasure and starts at
 * the dot's own radius, so with the loop off the two settle into a ring resting
 * on a dot rather than into an empty box. The original artwork was the ring
 * alone, growing from `r="0"` — which would have vanished entirely the moment a
 * theme turned the loop off.
 */
export function RunningIndicator({
  className = "size-4",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <circle cx="12" cy="12" r="4" />
      <circle
        className="animate-pulse-ring"
        cx="12"
        cy="12"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
