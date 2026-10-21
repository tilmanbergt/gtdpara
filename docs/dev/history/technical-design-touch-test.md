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
  - **H2 cancelled**: the touch arrives, but jitter or contact size cancels the press (press-in
    without press).
  - **H3 missed target**: the touch lands where nothing is tappable (row padding, a blank second
    line, gaps between checkbox, title and icons).
  - **H4 swallowed by a span**: the touch lands on a nested `<Text onPress>` that does nothing on
    one tap (`#next`/`#now` waits for a double tap) or is small and hard to hit (thread and loop
    tags).
  - **H5 wrong span**: a big contact resolves to another span or element than the one under the
    finger's centre.
- One page, no scrolling. Top to bottom: Finger/Pen toggle, "Log touches everywhere", Clear,
  Save log, Close; the counts; a target area down to the very bottom edge with real `TaskRow`s
  and `MeetingRow`s holding fixed sample entries (plain, 2-line, several context tags, `#next` +
  due + waiting-for, nested thread tag, loop-style tag, meetings), wired with the real
  `taskRowHeight`/`numberOfLines`, repeated until the bottom ~150 px are covered.
- Handlers only report; nothing is edited, ticked or opened.
- After each touch a marker at its start point (● handled, ○ cancelled, × no target,
  ◐ swallowed), one e-ink refresh per touch, counts per class split by Finger/Pen and by band
  (top / middle / bottom 20 % of the screen height).
- One `log()` line per touch, numbers only. "Save log" writes CSV
  (`id, mode, band, x, y, endX, endY, maxMove, ms, class, target, pointers`) to
  `EXPORT/gtdpara/debug/touch-<timestamp>.csv`.
- "Log touches everywhere": the same observer around the app root, raw touches only, one log line
  each. Off by default, not persisted.
- No behaviour change outside the test view, except the observe-only app-wide observer while on.

## 2. Current state: what the code already says

Numbers in dp (× 1.41 = px on the A5 X). Rows from `ui/TaskRow.tsx` and `ui/MeetingRow.tsx`.

**Todo row** (`paddingVertical 7`, border 1, `overflow: hidden`, 42 dp for one line, 64 for two):

- The title `Pressable` is only as tall as its text: 22 dp per line, starting 7 dp below the top.
  Across the title's width the top **7 dp** and the bottom **13 dp** are dead: 20 of 42 dp
  (≈ 48 %) in a 1-line row, 20 of 64 dp (≈ 31 %) in a 2-line row. Horizontally the title
  `Pressable` spans the whole width between checkbox and icons, so blank space to the right of a
  short title is live.
- When the line estimator predicts two lines but the title needs one, the row is 64 dp and the
  blank second line adds **35 dp** of dead area (only the first 29 dp from the top are live).
- Checkbox and note/clip icons have `hitSlop 8`, clipped by the row's `overflow: hidden`: live
  from the row top to about 35-37 dp. In a 2-line row the area **below the checkbox and below the
  icons** (≈ 27-29 dp tall) is dead.
- There are no horizontal gaps: the checkbox's and note icon's margins sit inside their
  `Pressable`s, and the 8 dp between note and clip is covered by their hit slop.

**Nested spans** (one tap, Daily's wiring):

- `#next` / `#now` label (`TaskLabels.handleNowPress`, wired wherever `onToggleNow` is passed:
  Daily, focus-mode picker): a single tap does nothing, it waits 350 ms for a second one. Every
  Next todo on Daily carries this label, so every Daily row has this dead spot (≈ 40 dp wide).
- `#w/f Name` label: opens the counterpart overview.
- Nested thread or loop tag (`TaggableText`): opens the thread or loop overview.
- Plain context tag (Daily only, `onToggleContext`): toggles Daily's tag filter, so a tap on it
  filters instead of editing.
- `#due …`, `#someday`: no `onPress`; the tap goes to the title (edit).
- Meeting row: the `#abbrev` / source name opens the Project or Area.

**Meeting row**: the main `Pressable` is the content height (22 dp, or 42 for two lines) from
7 dp down. Dead: top 7 dp and bottom 8 dp of a 37 dp row, top 7 and bottom 8 of a 57 dp row.

H1 and H5 cannot be decided from the code. Android hands RN one point per pointer (the contact
centroid), and RN resolves a nested span from that point, so H5 would have to come from the host
or firmware; the CSV's `target` per touch shows it.

## 3. Design

- **Classification** (`domain/touchDiag.ts`, pure): a raw touch plus the outcome events reported
  in its window (start − 50 ms .. end + 300 ms; an outcome in the overlap of two quick taps goes
  to the later touch) gives `handled` (a press, other than a single `#next` tap), `swallowed`
  (only `#next` presses), `cancelled` (a pressIn, a span losing the responder, or a system touch
  cancel, without a press) or `noTarget`. Also the band, the counts, the log lines and the CSV.
- **Observer** (`ui/touchDiag/TouchObserver.tsx`): `onTouchStart/Move/End/Cancel` on a View;
  they never take the responder. One record per pointer identifier. RN does not tell finger from
  pen, so the test view labels records with its Finger/Pen toggle.
- **Probe** (`ui/touchDiag/touchProbe.ts`): a context only the test view provides. `TaskRow`,
  `TaskLabels`, `TaggableText` and `MeetingRow` add `onPressIn`/`onPressOut` (and
  `onResponderTerminate` on spans) to their existing tap targets when it is set; thread tags and
  the `#w/f` label then report instead of opening an overview. `onPressIn`/`onPressOut` do not
  make a `<Text>` pressable (RN's `Text` checks `onPress`, `onLongPress` and
  `onStartShouldSetResponder` only), so hit areas stay as they are. Without the context nothing
  is added.
- **Store** (`utils/touchDiagStore.ts`): outcomes, the session's classified touches, the
  app-wide switch. In `utils/` so the debug bundle can read it.
- **View** (`screens/settings/TouchTestScreen.tsx`, parts in `screens/settings/touchTest/`):
  replaces the Settings content while open. Two columns like Daily, the right one with the
  Current tab's "+clip". The target area measures itself and fills each column with rows until
  the next one would not fit. Each touch is classified 320 ms after it ends.
- **App-wide** (`ui/touchDiag/AppTouchObserver.tsx` in `App.tsx`'s `AppRoot`): the wrapping
  View is always there (no remount when switched); while off it has no handlers. Quiet while the
  test view is open.
- **Debug bundle**: one line, `touch test: log touches everywhere ON|OFF · records N`.

## 4. Test scenarios

- Given the Inbox has "Call Anna", when I open Settings → Advanced → Touch test, then numbered
  sample rows show and none of my todos.
- When I tap a row's title and then a dead spot, then the first counts as handled (title), the
  second as no target.
- When I tap a checkbox and Save log, then a CSV with all touches is in EXPORT/gtdpara/debug and
  the status line says so; the Inbox is untouched.
- When I tap Close, Settings → Advanced shows again.
- When I switch on "Log touches everywhere", close the test and tap twice on Daily, then the log
  has two numbers-only lines; switched off, no touch handler is attached.

Unit tests: every class, the window and overlap rule, bands, log line, CSV and summary.

## 5. Test plan (device)

- [ ] The target area reaches the bottom edge; no row is cut off.
- [ ] Finger: ~5 taps on each row's title, top rows and bottom rows; tags and labels.
- [ ] Pen: the same.
- [ ] Each tap gives exactly one marker and one e-ink refresh; taps without a marker noted (H1).
- [ ] "Log touches everywhere" on, failed taps reproduced on Daily and Current near the bottom.
- [ ] Save log; CSV and debug bundle sent.

## As built

As designed. Sample rows are parsed from file lines (`touchTestSamples.ts`), so they carry the
fields the parser derives. The second tap of a `#next` double tap reports `nowToggle` and counts
as handled. Meeting rows in the test show no prep/review box (no Note setups are passed).
