/**
 * Capture and marks processing - one screen (docs/dev/technical-design-lasso-0.8.md
 * §3.7, screen designs A-C).
 *
 * Opened two ways (App.tsx, `mode === 'capture'`):
 * - from the lasso toolbar's "Capture Todo/Meeting" (`source: 'lasso'`): the
 *   lasso is read once, its picture shown, its strokes recognized as shifted
 *   copies (supernote/strokeRecognition.ts - the fix for text low on the page);
 *   open marks are listed in the left column too;
 * - from a "marks to process" card (`source: 'marks'`, a scope and where to
 *   go back to): the marks only.
 *
 * Left: ui/capture/MarksColumn.tsx (hidden when there is nothing to list
 * besides the lasso). Right: the picture, then QuickAddWidget
 * variant="capture" (flow, due, Split lines, tags, File to, Save buttons).
 *
 * Saving a mark removes its `## Marks` line, turns the bookmark into the
 * check icon and deletes its private data (storage/marks.ts finishMark).
 * Save & next: the next open mark in the column; only when there is none, a
 * cleared form for a typed extra item. The source page is linked as the
 * item's linked file (the clip), not as its working note. Typed but unsaved text of a mark is dropped when
 * another row is selected (its recognized text comes back).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {prepareCaptureText} from '../domain/captureText';
import {Destination, destinationLabel} from '../domain/destination';
import {collectOpenMarks, fileNameOf, groupMarks, markDate, MarkScope, OpenMark} from '../domain/marks';
import {findEnclosingItem, ResolvedParaPaths} from '../domain/settings';
import {buildPageAnchor} from '../domain/sharedNotePages';
import {getCachedData, rebuildCache, setCachedInbox} from '../storage/dataCache';
import {addMeetingToDestination, addTaskToDestination, buildMeeting, buildTask} from '../storage/itemMutations';
import {
  cleanMarkDataOrphans,
  createMarkFromLasso,
  finishMark,
  outcomeNeedsScreen,
  runPendingIconChanges,
  setMarkOutcome,
} from '../storage/marks';
import {toLinkedFile} from '../storage/linkedFiles';
import {loadProjectFile} from '../storage/projectFile';
import {loadSettings} from '../storage/settingsStorage';
import {FolderEntry, getCurrentNotePath, getPrivateDataDir, getPrivateTempDir, openPath} from '../supernote/fileSystem';
import {setLassoBoxState} from '../supernote/lasso';
import {LassoSnapshot, readLasso, saveLassoPreview} from '../supernote/lassoRead';
import {RecognitionResult, recognizeStrokes} from '../supernote/strokeRecognition';
import MarksColumn, {LASSO_KEY} from '../ui/capture/MarksColumn';
import {MarksReturnTo} from '../ui/marksNav';
import {useRecognitionQueue} from '../ui/capture/useRecognitionQueue';
import QuickAddWidget, {CaptureSaveMode, CaptureSeed, MeetingQuickAddFields} from '../ui/QuickAddWidget';
import {useErrorStatus, useStatus} from '../ui/status/StatusProvider';
import {COLORS, FONT, useThemeColors} from '../ui/theme';
import {useCachedInbox} from '../ui/useCachedInbox';
import {useCachedItems} from '../ui/useCachedItems';
import {log, logError} from '../utils/log';
import {requestEinkRefresh, useEinkRefreshOnLoad} from '../utils/screenRefresh';
import {errorMessage} from '../utils/errorMessage';

export type CaptureReturnTo = MarksReturnTo;

export type CaptureRequest =
  | {source: 'lasso'}
  | {source: 'marks'; scope: MarkScope; returnTo: CaptureReturnTo};

interface Props {
  request: CaptureRequest;
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  onOpenDaily: () => void;
  /** Back to the tabs (marks source: the screen the marks were opened from). */
  onExit: () => void;
}

interface Loaded {
  paths: ResolvedParaPaths;
  currentNotePath: string | null;
  /** Lasso source only. */
  lasso: LassoSnapshot | null;
  lassoPicture: string | null;
  lassoDestination: Destination;
  dataDir: string | null;
}

type LassoRecognition = {state: 'recognizing' | 'done'; text: string; error: string | null};

function fileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export default function CaptureScreen({request, onOpenItem, onOpenDaily, onExit}: Props): React.JSX.Element {
  const {isDarkMode, textColor, borderColor, placeholderColor} = useThemeColors();
  const fromLasso = request.source === 'lasso';
  const scope: MarkScope = request.source === 'marks' ? request.scope : {type: 'all'};

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEinkRefreshOnLoad(loaded === null && loadError === null);
  const [lassoRec, setLassoRec] = useState<LassoRecognition>({state: 'recognizing', text: '', error: null});
  const [lassoSaved, setLassoSaved] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string>(fromLasso ? LASSO_KEY : '');
  const [destination, setDestination] = useState<Destination>({type: 'inbox'});
  const [linkToPage, setLinkToPage] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [discardAsk, setDiscardAsk] = useState<OpenMark | null>(null);
  const [busy, setBusy] = useState(false);
  // True while a saved/discarded mark is being finished: its line leaves the
  // list before the next one is selected, and the "select the first" effect
  // below must not jump in between.
  const advancingRef = useRef(false);
  useErrorStatus('CaptureScreen.error', error, () => setError(null));
  useStatus('CaptureScreen.info', info ? {kind: 'info', text: info, onDismiss: () => setInfo(null)} : null);

  // ---- load ----
  // Lasso first (checkpoint C, "route A"): read the lasso and start its
  // recognition at once; settings, the project list (a cold rebuild takes
  // 2-3 s), the picture and the screen follow while the recognizer works.
  const load = useCallback(async () => {
    setLoadError(null);
    const t0 = Date.now();
    try {
      let lasso: LassoSnapshot | null = null;
      let recognition: Promise<RecognitionResult> | null = null;
      let recognitionStartMs = 0;
      if (fromLasso) {
        lasso = await readLasso();
        recognitionStartMs = Date.now() - t0;
        recognition = recognizeStrokes(lasso.strokes, lasso.textBoxText, lasso.displaySize ?? lasso.pageSize, lasso.page ?? 0);
      }
      const settings = await loadSettings();
      const cache = getCachedData() ?? (await rebuildCache(settings));
      let lassoPicture: string | null = null;
      if (fromLasso) {
        try {
          lassoPicture = await saveLassoPreview(`${await getPrivateTempDir()}/lasso-${Date.now()}.png`);
        } catch (e) {
          log('CaptureScreen: no lasso picture', errorMessage(e));
        }
      }
      const currentNotePath = lasso?.path ?? (await getCurrentNotePath());
      const enclosing = currentNotePath ? findEnclosingItem(cache.paths, currentNotePath) : null;
      const lassoDestination: Destination = enclosing
        ? {type: 'item', kind: enclosing.kind, name: enclosing.name, path: enclosing.path}
        : {type: 'inbox'};
      let dataDir: string | null = null;
      try {
        dataDir = await getPrivateDataDir();
      } catch (e) {
        log('CaptureScreen: no private data folder', errorMessage(e));
      }
      setLoaded({paths: cache.paths, currentNotePath, lasso, lassoPicture, lassoDestination, dataDir});
      const shownMs = Date.now() - t0;
      if (fromLasso) {setDestination(lassoDestination);}
      // Housekeeping, not awaited by the user.
      runPendingIconChanges(currentNotePath);
      if (!fromLasso) {cleanMarkDataOrphans();}
      if (lasso && recognition) {
        const r = await recognition;
        setLassoRec({state: 'done', text: r.text, error: r.error});
        if (lasso.elementCount > 0 && !r.text.trim()) {
          setInfo('No text was recognized from the lasso - type it.');
        }
        log(
          'CaptureScreen: lasso recognized',
          `chars=${r.text.length}`,
          `ms=${r.ms}`,
          `start=${recognitionStartMs}`,
          `shown=${shownMs}`,
          `text=${Date.now() - t0}`,
          r.error ?? '',
        );
      }
    } catch (e) {
      const message = errorMessage(e);
      logError('CaptureScreen: load failed', message);
      setLoadError(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // ---- marks ----
  const items = useCachedItems();
  const inbox = useCachedInbox();
  const marks = useMemo(
    () => (loaded ? collectOpenMarks(items, inbox, loaded.paths.inboxFolder, scope) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, items, inbox],
  );
  const ordered = useMemo(
    () => groupMarks(marks, loaded?.currentNotePath ?? null).flatMap(g => g.marks),
    [marks, loaded?.currentNotePath],
  );
  const selectedMark = ordered.find(m => m.mark.id === selectedKey) ?? null;
  const recognition = useRecognitionQueue(ordered, selectedMark ? selectedMark.mark.id : null);

  // Marks source: start with the first mark; when the selected one is gone, the next.
  useEffect(() => {
    if (!loaded || fromLasso || advancingRef.current) {return;}
    if (!selectedMark && ordered.length > 0) {selectMark(ordered[0]);}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, ordered.length, selectedMark]);

  const lassoPage = loaded?.lasso?.page ?? null;
  const marksOnThisPage =
    loaded && lassoPage != null ? marks.filter(m => m.absPath === loaded.currentNotePath && m.mark.page === lassoPage).length : 0;
  useEffect(() => {
    if (marksOnThisPage > 0) {setInfo(`${marksOnThisPage} open mark${marksOnThisPage === 1 ? '' : 's'} on this page`);}
  }, [marksOnThisPage]);

  function selectMark(open: OpenMark) {
    setSelectedKey(open.mark.id);
    setDestination(open.owner);
    setDiscardAsk(null);
    requestEinkRefresh();
  }
  const handleSelect = (key: string) => {
    Keyboard.dismiss();
    if (key === LASSO_KEY) {
      setSelectedKey(LASSO_KEY);
      if (loaded) {setDestination(loaded.lassoDestination);}
      requestEinkRefresh();
      return;
    }
    const open = ordered.find(m => m.mark.id === key);
    if (open) {selectMark(open);}
  };

  // ---- the seed for the panel ----
  const selectedText = selectedMark ? recognition.get(selectedMark.mark.id)?.text ?? '' : '';
  const seed: CaptureSeed | null = useMemo(() => {
    if (selectedKey === LASSO_KEY) {
      // Once something was saved from the lasso, coming back to its row gives an empty form.
      const raw = lassoSaved > 0 ? '' : lassoRec.text;
      const todo = prepareCaptureText(raw, 'todo');
      return {
        key: LASSO_KEY,
        items: todo.items,
        split: todo.split,
        meetingTitle: prepareCaptureText(raw, 'meeting').items[0],
      };
    }
    if (!selectedMark) {return null;}
    const todo = prepareCaptureText(selectedText, 'todo');
    return {
      key: selectedMark.mark.id,
      items: todo.items,
      split: todo.split,
      date: markDate(selectedMark.mark),
      meetingTitle: prepareCaptureText(selectedText, 'meeting').items[0],
    };
  }, [selectedKey, lassoRec.text, lassoSaved, selectedMark, selectedText]);

  // Recognition finishes long after the screen loaded: the new text in the
  // field and the column's status must be redrawn explicitly, or the e-ink
  // panel keeps the old picture until the next tap (checkpoint C; see
  // utils/screenRefresh.ts).
  const recognitionSignature = useMemo(
    () => Array.from(recognition.entries()).map(([id, r]) => `${id}:${r.state}`).join('|'),
    [recognition],
  );
  const seedText = seed ? `${seed.key}\u0000${seed.items.join('\n')}` : '';
  useEffect(() => {
    if (loaded) {requestEinkRefresh();}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lassoRec.state, seedText, recognitionSignature]);

  // ---- saving ----
  const sourcePath = selectedMark ? selectedMark.absPath : loaded?.currentNotePath ?? null;
  const sourcePage = selectedMark ? selectedMark.mark.page : lassoPage;
  // The source page becomes the item's LINKED FILE (the clip), never its
  // working note: the note icon keeps creating the item's own note.
  // Base-relative when the source lies under the base folder, else absolute.
  const linkedSource =
    linkToPage && sourcePath && loaded
      ? (() => {
          const file = toLinkedFile(loaded.paths, sourcePath);
          return sourcePage != null ? buildPageAnchor(file, sourcePage) : file;
        })()
      : '';

  const inboxContext = async (dest: Destination) => {
    if (!loaded) {throw new Error('Not loaded yet.');}
    const inboxState = dest.type === 'inbox' ? await loadProjectFile('inbox', loaded.paths.inboxFolder) : null;
    return {inbox: inboxState, inboxPath: loaded.paths.inboxFolder};
  };

  const onAddTask = async (text: string, dest: Destination) => {
    const {nextInbox} = await addTaskToDestination(buildTask(text, {linkedFile: linkedSource}), dest, await inboxContext(dest));
    if (nextInbox) {setCachedInbox(nextInbox);}
    log('CaptureScreen: todo saved', destinationLabel(dest), selectedMark ? 'mark' : 'lasso');
  };
  const onAddMeeting = async (fields: MeetingQuickAddFields, dest: Destination) => {
    const {nextInbox} = await addMeetingToDestination(
      buildMeeting({title: fields.title, date: fields.date, time: fields.time, endTime: fields.endTime, days: fields.days}, {linkedFile: linkedSource}),
      dest,
      await inboxContext(dest),
    );
    if (nextInbox) {setCachedInbox(nextInbox);}
    log('CaptureScreen: meeting saved', destinationLabel(dest), selectedMark ? 'mark' : 'lasso');
  };

  const openDestination = (dest: Destination) => {
    if (dest.type === 'inbox') {onOpenDaily();}
    else {onOpenItem(dest.kind, {name: dest.name, path: dest.path, isFolder: true});}
  };
  const close = () => {
    if (fromLasso) {PluginManager.closePluginView();}
    else {onExit();}
  };

  /** The mark after `id` in list order (null at the end). */
  const markAfter = (id: string): OpenMark | null => {
    const i = ordered.findIndex(m => m.mark.id === id);
    return i >= 0 && i + 1 < ordered.length ? ordered[i + 1] : null;
  };
  const afterMarkGone = (next: OpenMark | null) => {
    advancingRef.current = false;
    if (next) {selectMark(next);}
    else if (fromLasso) {handleSelect(LASSO_KEY);}
    else {onExit();}
  };

  const onCaptureSaved = async (mode: CaptureSaveMode) => {
    const savedTo = destination;
    if (selectedMark) {
      const open = selectedMark;
      const next = markAfter(open.mark.id);
      advancingRef.current = true;
      try {
        setBusy(true);
        const r = await finishMark(open, 'done', loaded?.currentNotePath ?? null);
        if (!r.iconOk) {
          setInfo(`Saved. The bookmark in ${fileNameOf(open.absPath)} p${open.mark.page + 1} stays as it is (${r.iconDetail}).`);
        }
      } catch (e) {
        setError(`Saved, but the mark could not be removed from its list: ${errorMessage(e)}`);
      } finally {
        setBusy(false);
      }
      advancingRef.current = false;
      if (mode === 'view') {return openDestination(savedTo);}
      if (mode === 'close') {return close();}
      return afterMarkGone(next);
    }
    // The lasso: it goes once the first item is saved.
    if (lassoSaved === 0) {
      await setLassoBoxState(2).catch(e =>
        logError('CaptureScreen: removing the lasso failed', errorMessage(e)),
      );
    }
    setLassoSaved(n => n + 1);
    if (mode === 'view') {return openDestination(savedTo);}
    if (mode === 'close') {return close();}
    // 'next': with open marks, on to the first one (this note's first);
    // without, the cleared form for a typed extra item (destination and link stay).
    if (ordered.length > 0) {selectMark(ordered[0]);}
  };

  // ---- extras ----
  const handleMarkForLater = async () => {
    Keyboard.dismiss();
    setBusy(true);
    const outcome = await createMarkFromLasso();
    setBusy(false);
    if (outcomeNeedsScreen(outcome)) {setMarkOutcome(outcome);}
    else {PluginManager.closePluginView();}
  };
  const handleOpenPage = async () => {
    if (!selectedMark) {return;}
    try {
      await openPath(selectedMark.absPath, selectedMark.mark.page);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const runDiscard = async (open: OpenMark) => {
    setDiscardAsk(null);
    const next = markAfter(open.mark.id);
    advancingRef.current = true;
    try {
      setBusy(true);
      const r = await finishMark(open, 'remove', loaded?.currentNotePath ?? null);
      setInfo(
        r.iconOk
          ? `Discarded the mark in ${fileNameOf(open.absPath)} p${open.mark.page + 1}.`
          : `Discarded. The bookmark in ${fileNameOf(open.absPath)} p${open.mark.page + 1} stays (${r.iconDetail}).`,
      );
    } catch (e) {
      setError(errorMessage(e));
      advancingRef.current = false;
      return;
    } finally {
      setBusy(false);
    }
    afterMarkGone(next);
  };
  const discardLabel = discardAsk
    ? (recognition.get(discardAsk.mark.id)?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || `p${discardAsk.mark.page + 1}`
    : '';
  useStatus(
    'CaptureScreen.discard',
    discardAsk
      ? {
          kind: 'confirm',
          text: `Discard mark "${discardLabel}" and remove its bookmark from ${fileNameOf(discardAsk.absPath)} p${discardAsk.mark.page + 1}?`,
          detail: 'The handwriting in the note stays as it is.',
          actions: [{label: 'Discard', primary: true, onPress: () => runDiscard(discardAsk)}],
          onCancel: () => setDiscardAsk(null),
        }
      : null,
  );

  // ---- render ----
  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={[styles.heading, {color: textColor}]}>{fromLasso ? 'New from Lasso' : 'Marks'}</Text>
        <Text style={[styles.hint, {color: textColor}]}>⚠ {loadError}</Text>
        <View style={styles.extrasRow}>
          <Pressable style={[styles.button, {borderColor}]} onPress={load} hitSlop={8}>
            <Text style={[styles.buttonText, {color: textColor}]}>↻ Retry</Text>
          </Pressable>
          <Pressable style={[styles.button, {borderColor}]} onPress={close} hitSlop={8}>
            <Text style={[styles.buttonText, {color: textColor}]}>✕ Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!loaded) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator />
        <Text style={[styles.hint, {color: textColor}]}>{fromLasso ? 'Reading lasso selection…' : 'Loading marks…'}</Text>
      </View>
    );
  }

  const showColumn = !fromLasso || marks.length > 0;
  const markPicture = (id: string) => (loaded.dataDir ? fileUri(`${loaded.dataDir}/marks/${id}/picture.png`) : null);
  // The lasso is saved and its row selected again (after Save & next with no
  // marks left): an empty form for a typed extra item, without the old picture.
  const lassoDone = selectedKey === LASSO_KEY && lassoSaved > 0;
  let pictureUri: string | null = null;
  if (selectedKey === LASSO_KEY && !lassoDone) {pictureUri = loaded.lassoPicture ? fileUri(loaded.lassoPicture) : null;}
  else if (selectedMark) {pictureUri = markPicture(selectedMark.mark.id);}
  let headerSource = '';
  if (selectedMark) {headerSource = `${fileNameOf(selectedMark.absPath)} · p${selectedMark.mark.page + 1}`;}
  else if (loaded.currentNotePath && !lassoDone) {
    headerSource = `${fileNameOf(loaded.currentNotePath)}${lassoPage != null ? ` · p${lassoPage + 1}` : ''}`;
  }
  const selectedState = selectedMark ? recognition.get(selectedMark.mark.id)?.state : undefined;
  const recognizing =
    selectedKey === LASSO_KEY ? !lassoDone && lassoRec.state === 'recognizing' : !!selectedMark && (!selectedState || selectedState === 'recognizing' || selectedState === 'waiting');
  const nothingSelected = !fromLasso && !selectedMark;
  let title = 'Marks';
  if (fromLasso) {title = 'New from Lasso';}
  else if (request.source === 'marks' && request.scope.type === 'item') {title = 'Marks here';}

  const extras = (
    <View>
      {sourcePath ? (
        <Pressable onPress={() => setLinkToPage(v => !v)} hitSlop={8} style={styles.checkboxRow} accessibilityRole="checkbox">
          <Text style={[styles.checkbox, {color: textColor}]}>{linkToPage ? '☑' : '☐'}</Text>
          <Text style={[styles.buttonText, {color: textColor}]}>{selectedMark ? 'Link to source page' : 'Link to this page'}</Text>
        </Pressable>
      ) : null}
      <View style={styles.extrasRow}>
        {selectedMark ? (
          <>
            <Pressable style={[styles.button, {borderColor}]} onPress={handleOpenPage} disabled={busy} hitSlop={8}>
              <Text style={[styles.buttonText, {color: textColor}]}>Open page</Text>
            </Pressable>
            <Pressable style={[styles.button, {borderColor}]} onPress={() => setDiscardAsk(selectedMark)} disabled={busy} hitSlop={8}>
              <Text style={[styles.buttonText, {color: textColor}]}>Discard…</Text>
            </Pressable>
          </>
        ) : null}
        {!selectedMark && fromLasso && lassoSaved === 0 ? (
          <Pressable style={[styles.button, styles.dashed, {borderColor}]} onPress={handleMarkForLater} disabled={busy} hitSlop={8}>
            <Text style={[styles.buttonText, {color: textColor}]}>Mark for later</Text>
          </Pressable>
        ) : null}
        <View style={styles.spacer} />
        <Pressable style={[styles.button, {borderColor}]} onPress={close} disabled={busy} hitSlop={8}>
          <Text style={[styles.buttonText, {color: textColor}]}>{fromLasso ? (lassoSaved === 0 ? 'Cancel' : 'Done') : 'Close'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, {color: textColor}]}>{title}</Text>
        <Text style={[styles.headerSource, {color: textColor}]} numberOfLines={1}>
          {headerSource}
        </Text>
      </View>
      <View style={styles.body}>
        {showColumn ? (
          <View style={[styles.column, {borderColor}]}>
            <MarksColumn
              marks={marks}
              currentPath={loaded.currentNotePath}
              withLasso={fromLasso}
              lassoText={lassoRec.text}
              lassoSaved={lassoSaved}
              selectedKey={selectedKey}
              onSelect={handleSelect}
              recognition={recognition}
              pictureUri={markPicture}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>
        ) : null}
        <View style={styles.panel}>
          {nothingSelected ? (
            <>
              <Text style={[styles.hint, {color: textColor}]}>No open marks left.</Text>
              {extras}
            </>
          ) : (
            <>
              {lassoDone ? (
                <Text style={[styles.doneHint, {color: textColor}]}>
                  {marks.length > 0 ? 'Lasso saved.' : 'Lasso saved · no marks left.'} Add another todo or press Done.
                </Text>
              ) : (
                <View style={[styles.pictureBox, {borderColor: isDarkMode ? COLORS.borderDark : COLORS.textLight}]}>
                  {pictureUri ? <Image source={{uri: pictureUri}} style={styles.picture} resizeMode="contain" /> : null}
                  {recognizing ? <Text style={styles.pictureNote}>recognizing…</Text> : null}
                </View>
              )}
              <QuickAddWidget
                variant="capture"
                captureSeed={seed}
                fixedDestination={destination}
                onCaptureDestinationChange={setDestination}
                captureOwnDestination={selectedMark ? selectedMark.owner : loaded.lassoDestination}
                onCaptureSaved={onCaptureSaved}
                onAddTask={onAddTask}
                onAddMeeting={onAddMeeting}
                initialDate={selectedMark ? markDate(selectedMark.mark) : undefined}
                captureExtras={extras}
                placeholder="Todo text"
                textColor={textColor}
                borderColor={borderColor}
                placeholderColor={placeholderColor}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, paddingHorizontal: 16, paddingTop: 8},
  centered: {justifyContent: 'center', alignItems: 'center'},
  headerRow: {flexDirection: 'row', alignItems: 'baseline', marginBottom: 8},
  heading: {fontSize: FONT.large, fontWeight: '700', marginRight: 16},
  headerSource: {flex: 1, fontSize: FONT.small, textAlign: 'right'},
  hint: {fontSize: FONT.medium, marginTop: 12},
  doneHint: {fontSize: FONT.medium, marginBottom: 10},
  body: {flex: 1, flexDirection: 'row'},
  column: {flex: 1, borderRightWidth: 1, paddingRight: 8, marginRight: 12},
  panel: {flex: 2},
  pictureBox: {height: 180, borderWidth: 1, marginBottom: 10, backgroundColor: '#ffffff', justifyContent: 'center'},
  picture: {width: '100%', height: '100%'},
  pictureNote: {position: 'absolute', right: 8, bottom: 4, fontSize: FONT.small, color: '#555555'},
  checkboxRow: {flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8},
  checkbox: {fontSize: FONT.large, marginRight: 8},
  extrasRow: {flexDirection: 'row', alignItems: 'center', marginTop: 4},
  button: {borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8},
  dashed: {borderStyle: 'dashed'},
  buttonText: {fontSize: FONT.small, fontWeight: '600'},
  spacer: {flex: 1},
});
