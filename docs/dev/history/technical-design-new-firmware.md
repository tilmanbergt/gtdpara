# Technical design: New plugin firmware and sn-plugin-lib 0.2.3 (0.15.0)

Status: **in progress** - steps F0-F3, F3b, F3c and F5's logging built; F3c waits for its device test.
Branch: `feature/note-setups` (ships with Note setups in 0.15.0; `nextVersion` stays `0.15.0`).

Background:
- Ratta's first public release of the plugin system: Manta/Nomad Chauvet 3.30.45, A5X/A6X
  Chauvet 2.27.42. Until now plugins ran only on developer/beta firmware; with this firmware the
  plugin API reaches regular users, and all users will move to it. 0.15.0 is the build most
  future gtdpara users start with (and the one for InkHub).
- Sources: Ratta's announcement (r/Supernote_dev, 2026-10-11) and a diff of the published
  packages 0.1.65 and 0.2.3.
- No new features. Note setups (steps 0-10 of 0.15.0) change only where a firmware step needs it.

## 1. What Ratta changed

- **All plugin coordinates are Android pixels on the page's real size** from
  `PluginFileAPI.getPageSize`. With 0.1.65 and earlier, stroke and five-star sample points were
  EMR coordinates (on the A5 X a 21632 × 16224 range, about 11.5 EMR per px), while geometry
  points, rects and text boxes were pixels. Plugins built with 0.1.65 or earlier keep the old
  behaviour.
- Read APIs returning page-size pixels, those gtdpara uses marked **(used)**:
  `PluginFileAPI.getElements` (used), `getElement`, `getLastElement`,
  `PluginCommAPI.getLassoElements` (used), `getLassoRect` (used), `generateLassoPreview` (used),
  `getLassoGeometries`, `PluginNoteAPI.getLassoLinks/Titles/Text`.
- Write APIs taking page-size pixels: `PluginFileAPI.insertElements` (used), `modifyElements`
  (used), `replaceElements`, `PluginCommAPI.insertPageElements` (used), `modifyPageElements`
  (used), `batchUpdatePageElements`, `recognizeElements` (used), `convertElement2Sticker`,
  `resizeLassoRect`, `lassoElements`, `insertGeometry`, `modifyLassoGeometry`, `insertFiveStar`,
  `PluginNoteAPI.insertTextLink`, `modifyLassoLink`, `insertText`, `modifyLassoText`.
- `PluginCommAPI.getPageDisplaySize` still returns the on-screen size and is deprecated for
  coordinate work; use `getPageSize` (with `getCurrentFilePath` + `getCurrentPageNum`).
- `Element.maxX/maxY` (EMR scale) and `PointUtils.androidPoint2Emr/emrPoint2Android` are
  deprecated and must not be used with 0.2.x.
- `PluginManager.requestPermission` can return -1 (dialog cancelled, nothing granted).
- The JS/TS surface of 0.2.3 is otherwise the same as 0.1.65 (comments, and
  `modifyPageElements`' result type `number[]`). The coordinate switch lives in the native
  `plugincommonlib.aar`, so tsc and Jest show none of it - only the device does.

## 2. Why it matters for gtdpara

The 0.8.0 lasso spike (`docs/dev/history/technical-design-lasso-0.8.md` §2.1) found that A5 X
stroke points use a larger EMR range than the page size implies; recognition with the page size
failed (host error 117) or came back partial below about 1368 px. 0.8.0 worked around it by
moving rebuilt strokes to the top-left (`shiftStrokes`, `SHIFT_ORIGIN_EMR = 300`) before
`recognizeElements`. With pixel strokes the root cause is gone and the workaround turns harmful:
300 is now 300 px (was about 26 px), so a wide lasso would be pushed past the 1404 px page edge.

## 3. Current state (code check on `feature/note-setups`)

- `package.json`: `"sn-plugin-lib": "^0.1.19"`, lock resolves 0.1.65; the caret does not reach
  0.2.x. npm, not yarn.
- `supernote/lassoRead.ts` `readLasso()`: `getLassoRect`, `getLassoElements` (stroke points and
  pressures via the accessors, text-box `textRect`), `getPageDisplaySize` → `displaySize`,
  `getPageSize` → `pageSize`.
- `supernote/strokeRecognition.ts` `recognizeStrokes(strokes, textBoxText, size, page)`: rebuilds
  strokes with `createElement(0)` from `shiftStrokes(strokes)`, then `recognizeElements(built,
  size)`. Serial chain.
- `domain/marks.ts`: `StoredStroke` (EMR points), `SHIFT_ORIGIN_EMR`, `shiftStrokes`, `iconBox`,
  `bookmarkPolygon`, `checkPolygon`, `MARK_DATA_VERSION = 1`, `MarkDataFile`, `parseMarkDataFile`.
- Callers passing `displaySize ?? pageSize`: `screens/CaptureScreen.tsx` (Capture from lasso) and
  `storage/marks.ts` `recognizeMark`. `storage/marks.ts` writes `MARK_DATA_VERSION` when marking.
- `supernote/markIcons.ts`: bookmark = geometry polygon (points already pixels in 0.1.65), found
  with `getElements`, changed with `modifyPageElements` / `modifyElements` or removed.
- Notes gtdpara writes (text boxes, titles, links): pixel rects from `NOTE_PAGE_WIDTH_PX = 1404` /
  `NOTE_PAGE_HEIGHT_PX = 1872` (`domain/pageLayout.ts`). On the A5 X page size = screen size.
- `supernote/fileSystem.ts` `Element` declares `maxX?/maxY?`; nothing reads them.
- `supernote/pluginPermissions.ts` treats `requestPermission(...) > 0` as granted, so -1 is
  already "not granted".
- Jest: no `__mocks__/sn-plugin-lib.js`; tests mock the library inline per file.

## 4. Decisions (Tilman, 2026-10-12/13)

- **D1** Move to the new firmware and sn-plugin-lib 0.2.x as soon as possible, inside 0.15.0
  (before the next public release instead of a separate 0.16.0). Pinned exactly (`0.2.3`):
  Ratta changed semantics without a major version, so upgrades must be deliberate.
- **D2** Old marks are not converted (only beta users of 0.8.0-0.15.0-beta can have any). New
  `mark.json` files get `MARK_DATA_VERSION = 2` (stroke points are page-size pixels). A version-1
  mark with `recognizedText` keeps working. A version-1 mark without recognized text is not sent
  to the recognizer: the processing screen shows its picture and a status-slot message, and the
  user types the text.
- **D3** Keep the release small: no layout change for other devices (reading `getPageSize`
  instead of 1404/1872 for written notes stays on the backlog), no lasso "route B".
- **D4** gtdpara 0.15.0 requires the new firmware (A5X/A6X Chauvet 2.27.42 or later,
  Manta/Nomad Chauvet 3.30.45 or later). Said in README, CHANGELOG (Upgrade note) and help. No
  runtime firmware check.
- **D5** Re-decide the stale-build warning (`ui/StaleBuildBanner.tsx`, from
  `docs/dev/history/technical-design-host-update-crash.md`). The new firmware says it fixes "a
  PluginHost crash when upgrading a plugin". Tilman picks at checkpoint A, from device evidence:
  - (a) the host unloads the old build (`staleBuilds` stays empty): keep the detection, prefer
    dropping the banner and restart path;
  - (b) old builds are still detected but no crash follows: remove banner and Restart, keep the
    count in the debug bundle and a log line;
  - (c) it still crashes: keep the warning (maybe softer wording).

## 5. Steps

Each step ends with `npm run check` green and one commit `firmware: step FN - <what>`.

- **F0** Library and this document: `npm install sn-plugin-lib@0.2.3 --save-exact`; decision
  line in `design-overview.md`.
- **F1** Coordinate diagnostics in `readLasso()`'s `lassoRead: done` line, numbers only:
  `pageSize`, `displaySize`, the rect, the bounds of all stroke points and the point count.
- **F2** Recognition on page-size pixels: no shift, `pageSize` first (`displaySize` only when
  `pageSize` is null, logged as `size=display`). Remove `shiftStrokes`/`SHIFT_ORIGIN_EMR`.
- **F3** Mark data version 2 (D2): pure `canRecognize(data)`; old marks without text are not
  recognized and show a status-slot message; the queue skips them.
- **Checkpoint A** after F3 plus F5's logging.
- **F3b** Lasso first (from checkpoint A, §7): picture right after path and page, no
  `getPageDisplaySize`, no cache refresh while a mark is saved, `ms` per step on `marks: saved`.
- **F3c** Cold mark faster (from the F3b device test, §7): App starts nothing while a mark is
  saved; the lasso is read before the first file write.
- **F4** Icons and written notes: verify on the device; change only what the device shows wrong.
- **F5** Stale-build warning: logging before checkpoint A, the chosen option (D5) after it.
- **F6** CHANGELOG, README, help, and this document's "As built".

## 6. Device test (Tilman, new firmware, A5 X; demo space first)

1. Capture: lasso handwriting at the top, middle and bottom of a page, and one lasso across the
   full page width → text recognized each time; second and third lasso in a row also work.
2. Text boxes: lasso a typed text box (and a mix with handwriting) → text appears.
3. Mark for later in a note: bookmark at the top right inside the lassoed area; process → text;
   Save → check icon; Discard on another → icon removed.
4. Mark for later in a PDF: same as 3 - watch the icon position closely.
5. Old mark (made with the pre-firmware 0.15.0 beta, not processed yet): picture shows, status
   message appears, typing the text and saving works.
6. Notes gtdpara writes: todo note and meeting note from a setup with headings → text boxes and
   headings where they were before; the table of contents still shows the headings.
7. Update over a running gtdpara (D5): with gtdpara open from a note, install a new build over
   it without restarting, twice. Does the "old version is still loaded" warning appear? Work for
   a few minutes without Restart (open a note, lasso capture, switch tabs): any crash or "not
   updated" dialog? Again once after a full device restart.
8. Debug bundle: `lassoRead: done` lines (page size, display size, rect, stroke bounds) and
   `pluginRuntime: stale builds` lines.

## 7. As built

Up to checkpoint A (F0-F3, F5 logging), where the build differs from §1-§6:

- **F0** `design-overview.md` has no §5; its decisions live in §4 "Why it is built this way",
  so the decision line is the §4 paragraph "Page-size pixels everywhere". There is no
  `__mocks__/sn-plugin-lib.js`: tests mock the library inline per file, none needed a change.
  `npm install` also brought the lock file's stale root `name`/`version` fields up to date.
- **F1** The `lassoRead: done` line logs `pageSize=WxH rect=l,t,r,b strokeBounds=l,t,r,b
  points=N` (plus `displaySize=` until F3b); the bounds come from the pure `domain/marks.ts` `strokeBounds`.
- **F2** Built as planned with a display-size fallback (`recognitionSize`, `size=display`);
  F3b removed it together with the `getPageDisplaySize` call: `recognizeStrokes(strokes,
  textBoxText, pageSize, page)` takes the page size only, and without one the recognition fails
  with "no page size" (logged, as before 0.15.0). `design-overview.md` §2.10 describes it.
- **F3** `canRecognize(data)` plus `isOldStrokeMark(data)` (strokes that can't be recognized).
  An old mark keeps its text-box text (only the handwriting is not recognized). The queue's
  preload (`storage/marks.ts` `storedMarkRecognition`, replacing `storedMarkText`) settles old
  marks before the queue runs, so they never show "recognizing…"; `recognizeMark` checks the
  same as a safety net. The column shows "no text" (or "recognized" when there was text-box
  text); the status slot shows "Marked with an older gtdpara - type the text from the picture."
  (`info`) while such a mark is selected.
- **F5 logging** `pluginRuntime: stale builds n=<count> <labels>` at mount, `stale-build
  warning shown`, and `stale-build warning, Restart tapped`. The warning has no dismiss
  control: "ignored" is a "shown" line without a later "Restart tapped". Log lines reach the
  debug bundle only with Debug logging on.

**Checkpoint A** (debug bundle 2026-10-13 23:22, A5 X on the new firmware; analysed by Tilman):
old marks showed their picture and the status message; new marks at the bottom, middle-bottom,
middle and middle-top were recognized. The first "Mark for later" right after a cold plugin start
lost the lasso: `readLasso` took about 7 s (`getPageDisplaySize` 2.2 s, `getLassoRect` 1.4 s) while
App's cache build ran in parallel, then `generateLassoPreview` and `setLassoBoxState(2)` both failed
with `904: No lasso action has been performed` - an empty picture, no text, the lasso box left on
the page. Later marks took about 0.3 s. The cause is the cold start, not the position at the
top of the page.

- **F3b** (`firmware: step F3b - lasso first`):
  - `readLasso({previewPath})` takes the picture right after `getCurrentFilePath` /
    `getCurrentPageNum`, before rect, elements and page size (`preview` in its timings). The Mark
    flow creates the mark folder first and passes the picture path; an empty lasso deletes the
    folder again. Capture does the same with its temp picture: its picture used to come after
    `rebuildCache`, the same hazard on a cold start from the Capture button.
  - `getPageDisplaySize` is no longer called; `LassoSnapshot` has no `displaySize`, new
    `mark.json` files write `displaySize: null`. `recognitionSize` and the `size=` log token went
    with it.
  - `storage/marks.ts` `trackMarkPress` (index.js wraps the Mark button's whole job in it, from
    the synchronous first moment) and `whenMarkSettled`; App's reorient waits for it before
    `refreshCache` and logs `App: cache refresh waited for the mark ms=` when it waited. The
    landing itself does not wait. The Capture button needs no wait: reorient skips the refresh
    when the lasso button routed to Capture, and Capture builds the cache only after the lasso
    read.
  - A failed picture is logged as before (`lassoRead: preview failed`) and the mark is kept.
  - `marks: saved` (and `marks: saving failed`) log `ms={"folder","lasso","lassoGone","icon",
    "data","line"}` next to `totalMs`.

**F3b device test** (debug bundle 2026-10-13 23:52, analysed by Tilman): the cold top-of-page mark
now has `picture=true`, no 904. But the cold mark took 5.7 s against about 1.1 s warm
(`ms={"folder":1559,"lasso":2962,…}`):
1. The deferral did not hold: on a pressEvent-3 start App still landed ("reorienting to current
   note's item"), the Files pane loaded and `rebuildCache` started during `readLasso` - only
   `refreshCache` had waited, the screens built the cache themselves. That slowed
   `getCurrentPageNum` (1.34 s) and the stroke reads (1.07 s).
2. The first `hasPermission(FILE:WRITE)` took 1.17 s, inside `ensureFolderExists` before the
   lasso read.

- **F3c** (`firmware: step F3c - cold mark faster`):
  - `reorient()` checks `isMarkInFlight()` at its start and again after its first reads (the
    press can come before App mounts - the library replays it to App's listener - or while
    `loadSettings`/`getCurrentNotePath` run); while a mark is saved it waits in
    `holdStartForMark` (logs `App: start held…` / `App: start resumed after the mark ms=`) and
    then starts over. Nothing lands, so no Files pane and no cache build start. The F3b wait
    in front of `refreshCache` is gone, the gate covers it.
  - The private temp clean-up moved from a mount effect into the first `reorient()` that lands
    on the tabs: the mark picture now lives in the temp folder until it is moved. It does not
    run on a start by the Capture button either (Capture's picture is there too).
  - `StaleBuildBanner` runs its diagnostics scan after `whenMarkSettled`.
  - Mark flow: picture to `<private tmp>/mark-<id>.png` (no permission needed), `readLasso`,
    remove the lasso box, icon, `moveFile` of the picture into `marks/<id>/picture.png`,
    `mark.json`, line. No `ensureFolderExists`: `moveFile` and the native text write create the
    folder, and the first write-permission check comes after the lasso is read and removed. A
    failed move logs `marks: keeping the picture failed` and keeps the mark (`picture=false`).
  - `ms` steps: `lasso`, `lassoGone`, `icon`, `picture`, `data`, `line`.
  - Not covered: a press that arrives only after `reorient()` already landed, or after the
    banner's scan started; the bundle showed the press within the first reads.
