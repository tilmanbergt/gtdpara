/**
 * The lasso capture panel's own state on top of Quick Add's drafts
 * (docs/dev/history/technical-design-lasso-0.8.md §3.5, §3.9): the
 * recognized seed, Split lines (one editable row per item), the "File to"
 * destination chips, the tag chip grid, and Save & next / view / close.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Keyboard} from 'react-native';
import {resolveAbbrevFileTarget} from '../../domain/abbrev';
import {joinItems, splitAtSelection, splitByHand} from '../../domain/captureText';
import {Selection} from '../../domain/clipboardText';
import {Destination, destinationLabel} from '../../domain/destination';
import {extractContextTags, insertTagAtPosition, removeTagFromText, stripSpaceAfterHash} from '../../domain/markdown';
import {composeTaskText} from '../../domain/quickAddCompose';
import {getRecentDestinations, getRecentDestinationsSync, recordDestinationUsed} from '../../storage/destinationUsage';
import {errorMessage} from '../../utils/errorMessage';
import {GridChip} from '../TagChipGrid';
import {useStableCallback} from '../useStableCallback';
import {buildFileToChips} from './fileToChips';
import {
  abbrevDestination,
  CaptureSaveMode,
  CaptureSeed,
  makeMeetingDraft,
  makeTaskDraft,
  MeetingQuickAddFields,
  truncateItemName,
} from './types';
import {MeetingDraftState} from './useMeetingDraft';
import {QuickAddCore} from './useQuickAddCore';
import {TaskDraftState} from './useTaskDraft';

/** Split lines: rows shown per page before ‹ › paging. */
export const SPLIT_ROWS_PER_PAGE = 6;
/** "File to" full list: items per page behind More…. */
export const FILE_TO_PAGE = 15;

interface Input {
  captureSeed?: CaptureSeed | null;
  fixedDestination: Destination;
  initialDate?: string;
  captureOwnDestination: Destination | null;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;
  onCaptureSaved?: (mode: CaptureSaveMode) => void;
  onCaptureDestinationChange?: (destination: Destination) => void;
  /** Set on every user change of the text: recognition then never overwrites it. */
  touchedRef: React.MutableRefObject<boolean>;
}

export function useCapture(core: QuickAddCore, task: TaskDraftState, meeting: MeetingDraftState, input: Input) {
  const {captureSeed, fixedDestination, touchedRef} = input;
  const {displayType, setError, setPending} = core;
  // One row per item while "Split lines" is on; null = one item in the task draft's text.
  const [splitRows, setSplitRows] = useState<string[] | null>(null);
  const [splitPage, setSplitPage] = useState(0);
  // "File to": short list, or the full alphabetical list (paged) behind More….
  const [recentDestinations, setRecentDestinations] = useState<string[]>(() => getRecentDestinationsSync() ?? []);
  const [fileToAll, setFileToAll] = useState(false);
  const [fileToPage, setFileToPage] = useState(0);
  useEffect(() => {
    let alive = true;
    getRecentDestinations().then(paths => {
      if (alive) setRecentDestinations(paths);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ---- The seed: a new key replaces the drafts, the same key only fills untouched text ----
  const seedKeyRef = useRef<string | null>(null);
  const applySeed = useStableCallback(() => {
    if (!captureSeed) return;
    const newKey = captureSeed.key !== seedKeyRef.current;
    if (!newKey && touchedRef.current) return;
    seedKeyRef.current = captureSeed.key;
    touchedRef.current = false;
    const items = captureSeed.items.length > 0 ? captureSeed.items : [''];
    const split = captureSeed.split && items.length > 1;
    const meetingTitle = captureSeed.meetingTitle ?? joinItems(items);
    if (newKey) {
      task.setDraft({...makeTaskDraft(), text: split ? '' : items[0]});
      meeting.setDraft({...makeMeetingDraft(captureSeed.date ?? input.initialDate), title: meetingTitle});
    } else {
      task.setDraft(d => ({...d, text: split ? '' : items[0]}));
      meeting.setDraft(d => ({...d, title: meetingTitle}));
    }
    setSplitRows(split ? items : null);
    setSplitPage(0);
    task.lastSelectionRef.current = null;
    meeting.lastSelectionRef.current = null;
  });
  // Re-applied only when what the seed says changes, never on a re-render.
  const seedSignature = captureSeed
    ? `${captureSeed.key}\u0000${captureSeed.split}\u0000${captureSeed.items.join('\n')}\u0000${captureSeed.meetingTitle ?? ''}`
    : null;
  useEffect(() => {
    if (seedSignature !== null) applySeed();
  }, [seedSignature, applySeed]);

  // ---- Split lines: one editable row per item, ‹ › paging past SPLIT_ROWS_PER_PAGE ----
  const touch = () => {
    touchedRef.current = true;
    task.clearJustAdded();
  };
  const toggleSplit = () => {
    touch();
    splitCursorRef.current = null;
    if (splitRows) {
      task.setDraft(d => ({...d, text: joinItems(splitRows)}));
      setSplitRows(null);
    } else {
      setSplitRows(splitByHand(task.draft.text));
      task.setDraft(d => ({...d, text: ''}));
    }
    setSplitPage(0);
  };
  const updateSplitRow = (index: number, value: string) => {
    touch();
    setSplitRows(rows => (rows ? rows.map((r, i) => (i === index ? stripSpaceAfterHash(value) : r)) : rows));
  };
  const removeSplitRow = (index: number) => {
    touch();
    splitCursorRef.current = null;
    setSplitRows(rows => {
      if (!rows) return rows;
      const next = rows.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
  };
  // ✂ Split at cursor (the recognizer gives no reliable line breaks). A
  // plain cursor splits there; a selection is cut out and becomes the next
  // item. In rows the focused row is split and the new item goes right
  // below it. The cursor is kept in refs, as for Cut/Paste - pressing the
  // button blurs the field first.
  const splitCursorRef = useRef<{index: number; selection: Selection} | null>(null);
  const splitAtCursor = () => {
    touch();
    if (splitRows) {
      const at = splitCursorRef.current;
      const parts =
        at && at.selection && at.index < splitRows.length
          ? splitAtSelection(splitRows[at.index], at.selection.start, at.selection.end)
          : null;
      if (!at || !parts) {
        setError('Tap into the text where it should be split.', 'text');
        return;
      }
      setSplitRows([...splitRows.slice(0, at.index), parts[0], parts[1], ...splitRows.slice(at.index + 1)]);
      setSplitPage(Math.floor((at.index + 1) / SPLIT_ROWS_PER_PAGE));
      splitCursorRef.current = null;
      setError(null);
      return;
    }
    const selection = task.lastSelectionRef.current;
    const parts = selection ? splitAtSelection(task.draft.text, selection.start, selection.end) : null;
    if (!parts) {
      setError('Tap into the text where it should be split.', 'text');
      return;
    }
    setSplitRows(parts);
    task.setDraft(d => ({...d, text: ''}));
    setSplitPage(0);
    task.lastSelectionRef.current = null;
    splitCursorRef.current = null;
    setError(null);
  };
  const splitPageCount = splitRows ? Math.max(1, Math.ceil(splitRows.length / SPLIT_ROWS_PER_PAGE)) : 1;
  const safeSplitPage = Math.min(splitPage, splitPageCount - 1);

  // ---- Destination: a typed #ABBR in any item wins over the "File to" choice ----
  const captureItems = (): string[] => (splitRows ?? [task.draft.text]).map(t => t.trim()).filter(t => t.length > 0);
  const abbrevTarget =
    displayType === 'meeting'
      ? meeting.abbrevTarget
      : resolveAbbrevFileTarget(splitRows ? splitRows.join(' ') : task.draft.text, core.abbrevItems, core.fixedExcludePath);
  const destination: Destination = abbrevTarget ? abbrevDestination(abbrevTarget) : fixedDestination;
  const count = displayType === 'task' ? captureItems().length : 1;

  const rememberDestination = (dest: Destination) => {
    if (dest.type !== 'item') return;
    setRecentDestinations(prev => [dest.path, ...prev.filter(p => p !== dest.path)]);
    recordDestinationUsed(dest.path);
  };

  const submit = async (mode: CaptureSaveMode) => {
    Keyboard.dismiss();
    if (core.pending) return;
    if (displayType === 'meeting') {
      const composed = meeting.compose(meeting.draft, meeting.abbrevTarget ? meeting.abbrevTarget.tag : null);
      if (!composed) return;
      setError(null);
      setPending(true);
      try {
        await input.onAddMeeting(composed.fields, destination);
      } catch (e) {
        setError(errorMessage(e));
        setPending(false);
        return;
      }
      setPending(false);
      meeting.setDraft(d => ({...makeMeetingDraft(d.date, false)}));
      meeting.setJustAdded(meeting.addedText(composed.fields.title, destination));
      core.recordTags(extractContextTags(composed.fields.title));
      rememberDestination(destination);
      touchedRef.current = false;
      input.onCaptureSaved?.(mode);
      return;
    }
    const list = captureItems();
    if (list.length === 0) {
      setError('Nothing to save - write a todo first.', 'text');
      return;
    }
    const tag = abbrevTarget ? abbrevTarget.tag : null;
    const texts = list.map(item => composeTaskText({...task.draft, text: item}, tag));
    setError(null);
    setPending(true);
    let saved = 0;
    try {
      for (const text of texts) {
        await input.onAddTask(text, destination);
        saved += 1;
      }
    } catch (e) {
      const message = errorMessage(e);
      // Saved ones are gone from the list; the rest stays for another try.
      if (splitRows && saved > 0) setSplitRows(splitRows.filter(r => r.trim()).slice(saved));
      setError(saved > 0 ? `Saved ${saved} of ${texts.length}. ${message}` : message);
      setPending(false);
      return;
    }
    setPending(false);
    task.resetAfterAdd();
    setSplitRows(null);
    touchedRef.current = false;
    task.setJustAdded(
      texts.length === 1
        ? `Added todo "${truncateItemName(list[0], 40)}" to ${destinationLabel(destination)}`
        : `Added ${texts.length} todos to ${destinationLabel(destination)}`,
    );
    core.recordTags(texts.flatMap(t => extractContextTags(t)));
    rememberDestination(destination);
    input.onCaptureSaved?.(mode);
  };

  // ---- Chips: tags toggle in the single text, or in every row while split ----
  // Tags already in the text come first (like Quick Add's pinned chips), then the recent ones.
  const tagText = displayType === 'meeting' ? meeting.fields.title : splitRows ? splitRows.join(' ') : task.fields.text;
  const tagChips: GridChip[] = Array.from(new Set([...extractContextTags(tagText), ...core.recentTags])).map(tag => {
    const lower = tag.toLowerCase();
    const has = (text: string) => extractContextTags(text).some(t => t.toLowerCase() === lower);
    const on =
      displayType === 'meeting'
        ? has(meeting.fields.title)
        : splitRows
          ? splitRows.length > 0 && splitRows.every(has)
          : has(task.fields.text);
    const onPress = () => {
      if (displayType === 'meeting') {
        if (on) meeting.removeTag(tag);
        else meeting.insertTag(tag);
      } else if (splitRows) {
        touchedRef.current = true;
        setSplitRows(rows =>
          rows ? rows.map(r => (on ? removeTagFromText(r, tag) : has(r) ? r : insertTagAtPosition(r, tag, null).text)) : rows,
        );
      } else if (on) task.removeTag(tag);
      else task.insertTag(tag);
    };
    return {key: tag, label: `#${core.recognizedAbbrevTags.has(lower) ? tag.toUpperCase() : tag}`, on, onPress};
  });
  const fileToChips: GridChip[] = buildFileToChips({
    items: core.abbrevItems,
    own: input.captureOwnDestination,
    current: destination,
    recent: recentDestinations,
    showAll: fileToAll,
    page: fileToPage,
    pageSize: FILE_TO_PAGE,
    onPick: picked => input.onCaptureDestinationChange?.(picked),
    setShowAll: setFileToAll,
    setPage: setFileToPage,
  });

  return {
    splitRows,
    splitPage: safeSplitPage,
    splitPageCount,
    setSplitPage,
    splitCursorRef,
    toggleSplit,
    updateSplitRow,
    removeSplitRow,
    splitAtCursor,
    destination,
    count,
    submit,
    tagChips,
    fileToChips,
    fileToAll,
  };
}

export type CaptureState = ReturnType<typeof useCapture>;
