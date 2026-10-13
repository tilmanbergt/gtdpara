# Technical design: New plugin firmware and sn-plugin-lib 0.2.3 (0.15.0)

Status: **in progress** - steps F0-F3 and F5's logging built, waiting for device checkpoint A.
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

(Filled in as the steps land.)
