/**
 * Lasso capture (design-overview.md §4's "Lasso capture" / original vision's
 * "lasso → recognize → classify Todo/Meeting → pick destination, defaulting
 * to Inbox when outside any Project/Area"). Reached only via App.tsx's
 * button listener routing a LASSO_BUTTON_ID press here - see App.tsx's own
 * comments for the button-event race this depends on.
 *
 * Flow: on mount, read the active lasso selection (supernote/lasso.ts) and
 * run handwriting recognition on it, into an editable text field (OCR can
 * be wrong or empty - editing, or "🔁 Retry recognition" below the field,
 * are the fallbacks, not an error state; a non-empty lasso that still comes
 * back with no recognized text shows an inline warning rather than failing
 * silently, since a silent empty field gave no signal of what went wrong).
 * "On mount" is load-bearing here: App.tsx renders this component with a
 * `key` that changes on every Lasso-button press specifically so a *second*
 * capture (while the plugin's JS instance is still alive from the first -
 * see App.tsx's own comment on captureNonceRef) gets a fresh mount and
 * re-runs this load, instead of silently reusing the previous capture's
 * stale text/kind/destination state. If recognition ever again looks like
 * it "didn't happen," `log`'s output (adb logcat -d -s ReactNativeJS:V)
 * from `runRecognition` (element/stroke counts, timing, host error) and `load` (the
 * recognized string) is the first thing to check.
 * The user then manually picks Todo or Meeting (no auto-detection -
 * recognized handwriting is too unreliable to guess the type from), and
 * optionally a "link to source note" checkbox (off by default) that points
 * the new Task/Meeting's notePath at the note being lassoed from - using
 * storage/noteLinks.ts's absolute-path notePath extension, since the source
 * note isn't necessarily anywhere under the destination folder.
 *
 * Destination (docs/dev/technical-design-filing-unification.md §8, 2026-09-07
 * filing unification - previously an overridable Inbox/Project/Area picker,
 * matching CaptureScreen's own original vision quoted above but going
 * against the wider app's push to make filing happen in one place): always
 * the current note's enclosing Project/Area, or Inbox if it has none - no
 * override, no choice. `load()`'s `defaultDestination` *is* the destination
 * now, not just a picker's starting value - "file it properly" happens
 * afterward, on the Inbox tab or Weekly Review's Inbox-to-zero step, the
 * same as every other capture surface in the app.
 *
 * Leaving this screen is always one of three explicit actions (no implicit
 * "back to Home" - that previously left it ambiguous whether/where anything
 * landed, and made a stale reorient() elsewhere in the app look like it had
 * saved into the wrong place): "Save & View" saves and jumps straight into
 * the chosen destination (the Project/Area's own ItemDetail, or Daily view
 * for Inbox, since Inbox has no ItemDetail of its own); "Save & Close" saves
 * and closes the plugin outright; "Cancel" discards and closes the plugin
 * without saving. All three close over the same performSave() so the
 * save logic itself only exists once.
 *
 * Saving a Project/Area destination goes through the same saveTasks/
 * saveMeetings + updateItemTasks/updateItemMeetings write-through pair every
 * other mutation in this app uses (design-overview.md §3, "write-through is
 * not optional"). Saving to Inbox uses the same saveTasks/saveMeetings
 * functions with kind: 'inbox' and itemPath = the base root - Inbox.txt
 * isn't part of storage/dataCache.ts's Project/Area `items` array (it's a
 * single flat file, not a scanned folder), so there's no cache entry to
 * write through; DailyView's own Inbox section just reads it fresh.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {Destination, destinationLabel} from '../domain/destination';
import {parseFlexibleTime, todayIso} from '../domain/meetingTime';
import {findEnclosingItem} from '../domain/settings';
import {getCachedData, rebuildCache, setCachedInbox} from '../storage/dataCache';
import {addMeetingToDestination, addTaskToDestination, buildMeeting, buildTask} from '../storage/itemMutations';
import {resolveNotePath} from '../storage/noteLinks';
import {loadProjectFile} from '../storage/projectFile';
import {loadSettings} from '../storage/settingsStorage';
import {FolderEntry, getCurrentNotePath} from '../supernote/fileSystem';
import {setLassoBoxState} from '../supernote/lasso';
import {readLasso} from '../supernote/lassoRead';
import {recognizeStrokes} from '../supernote/strokeRecognition';
import {log, logError} from '../utils/log';
import {useEinkRefreshOnLoad} from '../utils/screenRefresh';
import DateInput from '../ui/DateInput';
import {COLORS, FONT, useThemeColors} from '../ui/theme';
import {useErrorStatus, useStatus} from '../ui/status/StatusProvider';

interface Props {
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  onOpenDaily: () => void;
}

type Kind = 'todo' | 'meeting';

interface LoadedState {
  /** The Inbox folder (cache paths.inboxFolder) - where an Inbox capture is written. */
  inboxPath: string;
  currentNotePath: string | null;
  /** The one, non-overridable destination - see the module doc comment's "Destination" note. */
  defaultDestination: Destination;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function CaptureScreen({onOpenItem, onOpenDaily}: Props): React.JSX.Element {
  const {isDarkMode, textColor, borderColor, placeholderColor} = useThemeColors();

  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Explicit e-ink refresh once this screen's own load actually lands - see
  // src/utils/screenRefresh.ts.
  useEinkRefreshOnLoad(loading);

  const [text, setText] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionWarning, setRecognitionWarning] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('todo');
  const [date, setDate] = useState(() => todayIso());
  const [time, setTime] = useState('');
  const [linkToSource, setLinkToSource] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Save error and recognition warning -> the central status slot at the
  // top of this screen (docs/dev/technical-design-status-slot.md D11).
  useErrorStatus('CaptureScreen.error', error, () => setError(null));
  useStatus(
    'CaptureScreen.recognition',
    recognitionWarning ? {kind: 'warning', text: recognitionWarning, onDismiss: () => setRecognitionWarning(null)} : null,
  );

  // Shared by the initial load and the "🔁 Retry recognition" button - both
  // just want a fresh elements→size→text pass, without disturbing anything
  // else already chosen on screen (kind, destination, link-to-source).
  //
  // 0.8 (docs/dev/technical-design-lasso-0.8.md §2.1, §3.4): the lasso is read
  // once into plain data and the strokes are recognized as shifted copies -
  // passing the live elements with the page size failed for text low on the
  // page (the "second lasso recognizes nothing" bug). Text boxes are taken
  // as they are.
  const runRecognition = useCallback(async (): Promise<string> => {
    const snap = await readLasso();
    const elementCount = snap.elementCount;
    const result = await recognizeStrokes(snap.strokes, snap.textBoxText, snap.displaySize ?? snap.pageSize, snap.page ?? 0);
    log(
      'CaptureScreen: runRecognition',
      `elements=${elementCount}`,
      `strokes=${snap.strokes.length}`,
      `chars=${result.text.length}`,
      `ms=${result.ms}`,
      result.error ?? '',
    );
    const recognized = result.text;
    // Empty elements is caught as fatal by the caller (nothing was lassoed
    // at all); a non-empty lasso that still recognized to nothing is a
    // narrower, non-fatal case worth surfacing explicitly - a silently
    // empty text field gives no signal of *why* it's empty, which is
    // exactly what made the previous version's occasional empty-recognition
    // outcome look like nothing happened rather than like a real, visible
    // recognition failure.
    setRecognitionWarning(
      elementCount > 0 && recognized.trim().length === 0
        ? 'No text was recognized from the lasso selection - type it manually, or try again.'
        : null,
    );
    return recognized;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [settings, currentNotePath] = await Promise.all([loadSettings(), getCurrentNotePath()]);

      // Warms the shared cache (for performSave's later ensureItemCached
      // call) - the return value itself is no longer needed here now that
      // the destination picker (which used to list its Projects/Areas) is
      // gone (docs/dev/technical-design-filing-unification.md §8).
      // The cache's paths carry the effective Inbox location
      // (docs/dev/technical-design-inbox-as-area.md §3.3) - never address
      // the Inbox through resolvePaths(settings) directly.
      const cache = getCachedData() ?? (await rebuildCache(settings));
      const paths = cache.paths;

      const enclosing = currentNotePath ? findEnclosingItem(paths, currentNotePath) : null;
      const defaultDestination: Destination = enclosing
        ? {type: 'item', kind: enclosing.kind, name: enclosing.name, path: enclosing.path}
        : {type: 'inbox'};

      const recognized = await runRecognition();
      log('CaptureScreen: load recognized', JSON.stringify(recognized));

      setLoaded({inboxPath: paths.inboxFolder, currentNotePath, defaultDestination});
      setText(recognized);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError('CaptureScreen: load failed', message);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [runRecognition]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetryRecognition = () => {
    Keyboard.dismiss();
    setRecognizing(true);
    setError(null);
    (async () => {
      try {
        setText(await runRecognition());
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('CaptureScreen: retry recognition failed', message);
        setError(message);
      } finally {
        setRecognizing(false);
      }
    })();
  };

  /**
   * Validates the current fields and writes the Task/Meeting to its
   * destination (Inbox or a Project/Area). Returns true on success (leaving
   * it to the caller to decide what "success" navigates to - see the three
   * handlers below), false if validation or the save itself failed (error
   * state is already set either way, caller just needs to not proceed).
   */
  const performSave = async (): Promise<boolean> => {
    if (!loaded) return false;
    setError(null);

    // Always loaded.defaultDestination - never overridable, see the module
    // doc comment's "Destination" note.
    const destination = loaded.defaultDestination;

    const trimmedText = text.trim();
    if (!trimmedText) {
      setError('Nothing to save - the text is empty.');
      return false;
    }
    let resolvedTime = '';
    if (kind === 'meeting') {
      if (!DATE_RE.test(date)) {
        setError('Date must be YYYY-MM-DD.');
        return false;
      }
      const timeResult = parseFlexibleTime(time);
      if (!timeResult.ok) {
        setError(timeResult.error);
        return false;
      }
      resolvedTime = timeResult.value;
    }

    const notePath = linkToSource && loaded.currentNotePath ? loaded.currentNotePath : '';

    try {
      // One shared write path (storage/itemMutations.ts, 2026-09-20) - the
      // Inbox state is read fresh from disk here; the returned `nextInbox`
      // goes into the shared Inbox copy below.
      const inboxState = destination.type === 'inbox' ? await loadProjectFile('inbox', loaded.inboxPath) : null;
      const ctx = {inbox: inboxState, inboxPath: loaded.inboxPath};
      const {nextInbox} =
        kind === 'todo'
          ? await addTaskToDestination(buildTask(trimmedText, {notePath}), destination, ctx)
          : await addMeetingToDestination(
              buildMeeting({title: trimmedText, date, time: resolvedTime}, {notePath}),
              destination,
              ctx,
            );
      // The shared Inbox copy (storage/dataCache.ts) - so Daily and Inbox show the capture.
      if (nextInbox) setCachedInbox(nextInbox);

      // Cleanup only, never fatal to the capture itself - the Task/Meeting
      // is already saved by this point regardless of whether the native
      // lasso box clears successfully.
      await setLassoBoxState(2).catch(e =>
        logError('CaptureScreen: setLassoBoxState cleanup failed', e instanceof Error ? e.message : String(e)),
      );

      log('CaptureScreen: saved', kind, destinationLabel(destination));
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError('CaptureScreen: save failed', message);
      setError(message);
      return false;
    }
  };

  const withSaving = (after: () => void) => {
    if (saving) return;
    Keyboard.dismiss();
    setSaving(true);
    (async () => {
      const ok = await performSave();
      setSaving(false);
      if (ok) after();
    })();
  };

  const handleSaveAndView = () =>
    withSaving(() => {
      if (!loaded) return;
      const destination = loaded.defaultDestination;
      if (destination.type === 'inbox') {
        onOpenDaily();
      } else {
        onOpenItem(destination.kind, {name: destination.name, path: destination.path, isFolder: true});
      }
    });

  const handleSaveAndClose = () => withSaving(() => PluginManager.closePluginView());

  const handleCancel = () => {
    Keyboard.dismiss();
    PluginManager.closePluginView();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator />
        <Text style={[styles.hint, {color: textColor}]}>Reading lasso selection…</Text>
      </View>
    );
  }

  if (loadError || !loaded) {
    return (
      <View style={styles.container}>
        <Text style={[styles.heading, {color: textColor}]}>New from Lasso</Text>
        <Text style={[styles.error, {color: textColor}]}>
          ⚠ {loadError || 'Could not read the lasso selection.'}
        </Text>
        <View style={styles.footerRow}>
          <Pressable style={[styles.footerButton, {borderColor}]} onPress={load} hitSlop={8}>
            <Text style={[styles.footerButtonText, {color: textColor}]}>↻ Retry</Text>
          </Pressable>
          <Pressable style={[styles.footerButton, {borderColor}]} onPress={handleCancel} hitSlop={8}>
            <Text style={[styles.footerButtonText, {color: textColor}]}>✕ Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, {color: textColor}]}>New from Lasso</Text>

      <View style={styles.body}>
        <Text style={[styles.sectionTitle, {color: textColor}]}>Text</Text>
        <TextInput
          style={[styles.textArea, {color: textColor, borderColor}]}
          value={text}
          onChangeText={text => {
            setText(text);
            setRecognitionWarning(null);
          }}
          placeholder="Recognized text (edit if needed)"
          placeholderTextColor={placeholderColor}
          multiline
          autoCapitalize="none"
        />
        <View style={styles.retryRow}>
          <Pressable onPress={handleRetryRecognition} disabled={recognizing} hitSlop={8}>
            {recognizing ? (
              <ActivityIndicator />
            ) : (
              <Text style={[styles.retryText, {color: textColor}]}>🔁 Retry recognition</Text>
            )}
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpacing, {color: textColor}]}>Type</Text>
        <View style={styles.kindRow}>
          <Pressable
            style={[styles.kindButton, {borderColor}, kind === 'todo' && styles.kindButtonSelected]}
            onPress={() => setKind('todo')}>
            <Text style={[styles.kindButtonText, {color: textColor}]}>📋 Todo</Text>
          </Pressable>
          <Pressable
            style={[styles.kindButton, {borderColor}, kind === 'meeting' && styles.kindButtonSelected]}
            onPress={() => setKind('meeting')}>
            <Text style={[styles.kindButtonText, {color: textColor}]}>📅 Meeting</Text>
          </Pressable>
        </View>

        {kind === 'meeting' && (
          <View style={styles.meetingFieldsRow}>
            {/* Shared date field with the -1/Today/+1/+7 strip
                (ui/DateInput.tsx) - same 130px width and 6px gap as the time
                field beside it. */}
            <DateInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderColor={placeholderColor}
              textColor={textColor}
              borderColor={borderColor}
              width={130}
              containerStyle={styles.meetingDateWrap}
            />
            <TextInput
              style={[styles.meetingFieldInput, {color: textColor, borderColor}]}
              value={time}
              onChangeText={setTime}
              placeholder="HH:mm (optional)"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
            />
          </View>
        )}

        <Text style={[styles.sectionTitle, styles.sectionSpacing, {color: textColor}]}>Destination</Text>
        {/* Never a picker - always loaded.defaultDestination (the source
            note's enclosing Project/Area, or Inbox), no override possible.
            See the module doc comment's "Destination" note. */}
        <View style={[styles.destinationRow, {borderColor}]}>
          <Text style={[styles.rowText, {color: textColor}]}>{destinationLabel(loaded.defaultDestination)}</Text>
        </View>

        {loaded.currentNotePath && (
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setLinkToSource(prev => !prev)}
            hitSlop={8}>
            <Text style={styles.checkbox}>{linkToSource ? '☑' : '☐'}</Text>
            <Text style={[styles.rowText, {color: textColor}]}>🔗 Link to source note</Text>
          </Pressable>
        )}


        <View style={styles.footerRow}>
          <Pressable
            style={[styles.footerButton, styles.footerButtonPrimary]}
            onPress={handleSaveAndView}
            disabled={saving}
            hitSlop={8}>
            {saving ? <ActivityIndicator color="#ffffff" /> : (
              <Text style={styles.footerButtonPrimaryText}>💾 Save &amp; View</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.footerButton, {borderColor}]}
            onPress={handleSaveAndClose}
            disabled={saving}
            hitSlop={8}>
            <Text style={[styles.footerButtonText, {color: textColor}]}>💾 Save &amp; Close</Text>
          </Pressable>
          <Pressable style={[styles.footerButton, {borderColor}]} onPress={handleCancel} disabled={saving} hitSlop={8}>
            <Text style={[styles.footerButtonText, {color: textColor}]}>✕ Cancel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    // Was 40 - the status slot above this screen (App.tsx) now uses the
    // top space (docs/dev/technical-design-status-slot.md D11).
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: FONT.large,
    fontWeight: '700',
    marginBottom: 20,
  },
  hint: {
    fontSize: FONT.medium,
    opacity: 0.6,
    marginTop: 12,
  },
  body: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionSpacing: {
    marginTop: 20,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: FONT.medium,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  retryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  warning: {
    fontSize: FONT.small,
    flex: 1,
    marginRight: 8,
  },
  retryText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  kindRow: {
    flexDirection: 'row',
  },
  // e-ink note: the selected state is a thick border, not a filled
  // background - a solid dark fill (this used to be #2f6feb) reads as a
  // near-black blob on an e-ink panel and makes the label text on top of it
  // unreadable, unlike on a color LCD.
  kindButton: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  kindButtonSelected: {
    borderWidth: 3,
    borderColor: COLORS.accent,
  },
  kindButtonText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  meetingFieldsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  /** Wrapper margin for the date field (DateInput takes layout via containerStyle) - same gap meetingFieldInput's own marginRight gives the time field. */
  meetingDateWrap: {
    marginRight: 6,
  },
  meetingFieldInput: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: FONT.small,
    marginRight: 6,
    width: 130,
  },
  destinationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowText: {
    fontSize: FONT.medium,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  checkbox: {
    fontSize: FONT.medium,
    marginRight: 8,
  },
  error: {
    fontSize: FONT.small,
    marginTop: 12,
  },
  footerRow: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 30,
  },
  footerButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  footerButtonPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  footerButtonText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  footerButtonPrimaryText: {
    color: COLORS.accentText,
    fontSize: FONT.small,
    fontWeight: '600',
  },
});
