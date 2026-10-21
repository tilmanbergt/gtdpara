# Technical design: Touch test (diagnostic)

A diagnostic for "finger taps get lost", mainly on rows near the bottom of the screen. It finds
out why; it fixes nothing. The fix follows as a separate bugfix once the data is in
(DEVELOPMENT-POLICY §1: exact failure, then root cause, then fix). The view stays in the app for
later touch problems.

## 1. Requirements as decided

- A **Touch test** button under Settings → Advanced → Tools opens a full-screen view (under the
  tab bar and status slot, like every tab) that tells these hypotheses apart:
  - **H1 never arrives**: the host or system swallows finger touches near the bottom edge; React
    Native never sees them.
  - **H2 cancelled**: the touch arrives, but jitter or contact size cancels the press.
  - **H3 missed target**: the touch lands where nothing is tappable.
  - **H4 swallowed by a span**: the touch lands on a nested `<Text onPress>` that does nothing on
    one tap (`#next`/`#now`), or on a small tag span.
  - **H5 wrong target**: the contact resolves to another element than the one Tilman aimed at.
    Only his verdict can show this.
- Two columns of the normal two-column width (rows wrap as on Daily and Current): a test column
  and an info column; "⇄ Swap sides" swaps them, and the side is part of every record.
- Test column, down to the very bottom edge: real `TaskRow`s and `MeetingRow`s with fixed sample
  entries (plain 1- and 2-line titles, several context tags, `#next` + due, waiting-for + due,
  nested thread tag, loop tag, meetings, and todos and meetings that are only or nearly only
  tags), wired with the real `taskRowHeight`/`numberOfLines`, repeated to the bottom. Handlers
  only report. The hit part gets a black frame (or is filled) until the next touch; a dot marks
  the raw touch point, a × replaces it when nothing was hit. One e-ink refresh per touch.
- Info column: Finger/Pen, ⇄ Swap sides, "Log touches everywhere", Clear, Save log, Close; the
  last tap in words with position, band, movement and duration; verdict buttons Intended / Not
  intended (then "Tap what you meant (use the pen)": the next test-column touch becomes that
  record's `intendedTarget` and is not a test tap) and Skip; a table of classes and verdicts by
  Finger/Pen, side and band. Taps in the info column are never test taps.
- Output: one `log()` line per test tap, one per verdict and one per intended target, ids and
  numbers only. "Save log" writes CSV (`id, mode, side, band, x, y, endX, endY, maxMove, ms,
  pointers, class, target, verdict, intendedTarget`, positions in device pixels) to
  `EXPORT/gtdpara/debug/touch-<timestamp>.csv`.
- "Log touches everywhere": the same observer around the app root, raw touches only, one log line
  each. Off by default, not persisted.
- No behaviour change outside the test view, except the observe-only app-wide observer while on.

## 2. Current state: what the code already says

dp from the styles; px = dp × 1.41 on the A5 X (rounded).

**Todo row** (`ui/TaskRow.tsx`: `paddingVertical 7`, bottom border 1, `overflow: hidden`;
42 dp = 59 px for one line, 64 dp = 90 px for two):

- The title `Pressable` is only as tall as its text (22 dp = 31 px per line, from 7 dp = 10 px
  below the row top). It spans the whole width between checkbox and icons, so blank space to the
  right of a short title is live.
- 1-line row: across the title, the top **10 px** and the bottom **18 px** are dead, 28 of 59 px
  (≈ 48 %).
- 2-line row: across the title, top 10 px and bottom 18 px dead (28 of 90 px). Checkbox and icons
  reach about 37 dp (52 px) down with their `hitSlop 8` (cut off by `overflow: hidden`), so
  **below the checkbox ≈ 38 px** and **below the icons ≈ 41 px** are dead.
- A row predicted at two lines whose title fits on one (the estimator errs that way): the empty
  second line makes **49 px** dead below the title.
- No dead gaps sideways: the checkbox's and note icon's margins sit inside their `Pressable`s, and
  the 8 dp between note and clip is covered by hit slop.

**Meeting row** (`ui/MeetingRow.tsx`): the main `Pressable` (time + title) is the content height.
1-line row 37 dp = 52 px: top 10 px and bottom 11 px dead. 2-line row 57 dp = 80 px: top 10 px
and bottom 11 px dead.

**Nested `onPress` spans and what one tap does** (as wired on Daily):

- `#next` / `#now` label (`TaskLabels.handleNowPress`, wherever `onToggleNow` is passed: Daily
  and the focus-mode picker): **nothing**; it waits 350 ms for a second tap. Every Next todo on
  Daily shows this label.
- `#w/f Name` label: opens the counterpart overview.
- Nested thread or loop tag (`TaggableText`): opens the thread or loop overview.
- Plain context tag (Daily only, `onToggleContext`): toggles Daily's tag filter, not edit.
- `#due …`, `#someday`: no `onPress` of their own; the tap goes to the title (edit).
- Meeting `#abbrev` / source name: opens the Project or Area.

So a title made only of tags is almost all spans: on Daily a tap on it toggles a filter or opens
an overview, and only the spaces between tags and the blank rest of the line still edit.

H1 cannot be decided from the code. Android hands React Native one point per pointer, and RN
resolves a nested span from that point, so a "wrong target" (H5) comes from where that point
lands relative to the aim, which only Tilman's verdict shows.

## 3. Design

- **Classification and counts** (`domain/touchDiag.ts`, pure): targets are `<row>:<part>`
  (`checkbox`, `title`, `tag:<n>`, `label:<kind>`, `noteIcon`, `clip`, `rowBody`). A raw touch
  plus the outcome events in its window (start − 50 ms .. end + 300 ms; an outcome in the overlap
  of two quick taps goes to the later touch) gives `handled`, `swallowed` (only inert presses),
  `cancelled` (pressIn, a span losing the responder, or a system cancel, without a press) or
  `noTarget`. Also the words for the info column (no row texts), the counts by mode × side ×
  band with verdicts, the log lines and the CSV.
- **Observer** (`ui/touchDiag/TouchObserver.tsx`): `onTouchStart/Move/End/Cancel` on a View, which
  never take the responder. One record per pointer. RN does not tell finger from pen, so the
  Finger/Pen toggle labels records. Only the test column is observed, so info-column taps leave
  no record at all.
- **Probe** (`ui/touchDiag/touchProbe.ts`): each test row is wrapped in a context provider bound
  to its row number. With it, `TaskRow`, `TaskLabels`, `TaggableText` and `MeetingRow` add
  `onPressIn`/`onPressOut` (and `onResponderTerminate` on spans) to their existing tap targets,
  report a single `#next` tap as an inert press, report tags and the `#w/f` label instead of
  opening anything, and draw the hit part: `ui/touchDiag/HitFrame.tsx` (an absolute frame, so
  nothing moves) for `Pressable`s, a filled span for tags and labels. The title gets the frame
  only: bold would rewrap it and move every target after it. `onPressIn`/`onPressOut` don't make
  a `<Text>` pressable, so hit areas stay as they are. Without the context nothing is added.
- **Store** (`utils/touchDiagStore.ts`): outcomes, the session's taps with verdicts, the app-wide
  switch. In `utils/` so the debug bundle can read it.
- **View** (`screens/settings/touchTest/`): `TouchTestScreen` (layout and swap), `TestColumn`
  (measures itself, fills with `TestRows`, draws `LastTouchMarker`), `InfoColumn` with
  `TestControls`, `LastTapInfo`, `VerdictButtons`, `SummaryTable`; logic in `useTouchSession`.
  Every second round of samples also shows the Current tab's "+clip".
- **App-wide** (`ui/touchDiag/AppTouchObserver.tsx` in `App.tsx`'s `AppRoot`): the wrapping View
  is always there (no remount when switched); while off it has no handlers. Quiet while the test
  view is open.
- **Debug bundle**: `touch test: log touches everywhere ON|OFF · records N`.
- A todo shows `#next` or `#w/f`, never both (one flow state), so the two labels are in two rows.

## 4. Test scenarios

- Given the Inbox has "Call Anna", when I open Settings → Advanced → Touch test, then numbered
  sample rows and tag-only rows show, and none of my todos.
- When I tap the title of row 1, then the info column says "Row 1 · title · handled".
- When I tap where nothing reacts and say Not intended, then it asks for a tap on what I meant;
  when I tap the title of row 2, then that is stored as what I meant and not counted as a tap.
- When I tap `#next` once, then it says "swallowed (needs double tap)" and the label is filled.
- When I swap sides, tap a checkbox and Save log, then the CSV has every test tap with side,
  class, target, verdict and intended target; the Inbox is untouched.
- When I switch on "Log touches everywhere", then a tap in the test gives only its own line and
  each tap on Daily one raw line; switched off, no touch handler is attached.

Unit tests: every class, the window and overlap rule, bands, words, counts with verdicts,
verdict updates, log lines and CSV.

## 5. Test plan (device)

- [ ] The test column reaches the bottom edge; no row is cut off; the info column fits.
- [ ] The hit part is framed or filled, the dot or × sits under the finger, one refresh per tap.
- [ ] Finger: titles, tags and labels in top and bottom rows, ~5 taps each, with a verdict.
- [ ] Swap sides and repeat; then the same with the pen.
- [ ] "Log touches everywhere" on, failed taps reproduced on Daily and Current near the bottom.
- [ ] Save log; CSV and debug bundle sent.

## As built

As designed. Sample rows are parsed from file lines (`touchTestSamples.ts`), so they carry the
fields the parser derives; tag-only rows carry no row number in their text (the info column names
them). Meeting rows in the test show no prep/review box (no Note setups are passed).
