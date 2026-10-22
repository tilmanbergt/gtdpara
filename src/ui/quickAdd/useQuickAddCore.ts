/**
 * The state every Quick Add draft shares (ui/QuickAddWidget.tsx,
 * ui/quickAdd/CaptureQuickAdd.tsx): which tab shows, the one edit-fields
 * slot, the pending flag, the error and "Saved …" texts, the recent tags
 * and the Projects/Areas whose abbreviations file an item.
 *
 * Errors and success texts go to the central status slot
 * (docs/dev/history/technical-design-status-slot.md §7.3); only the ⚠ mark
 * stays in place, on the field the error is about (`fieldMark`) or on the
 * Add/Save button.
 */
import {useCallback, useEffect, useState} from 'react';
import {AbbrevFileMatch} from '../../domain/abbrev';
import {Destination} from '../../domain/destination';
import {getRecentTags, getRecentTagsSync, recordTagsUsed} from '../../storage/tagUsage';
import {useAbbrevItems} from '../useAbbrevItems';
import {EditFields} from './editFields';
import {QuickAddField, QuickAddType} from './types';

interface Input {
  fixedDestination: Destination;
  /** The edited item's real location - see QuickAddWidget's `editingItemPath` prop. */
  editingItemPath?: string | null;
}

export function useQuickAddCore({fixedDestination, editingItemPath}: Input) {
  const [activeType, setActiveType] = useState<QuickAddType>('task');
  const [editFields, setEditFields] = useState<EditFields | null>(null);
  const [pending, setPending] = useState(false);
  // Validation/save error, plus which field it's about (drives the in-place
  // ⚠ mark; null = the Add/Save button gets it).
  const [errorState, setErrorState] = useState<{text: string; field: QuickAddField | null} | null>(null);
  const setError = useCallback(
    (text: string | null, field: QuickAddField | null = null) => setErrorState(text ? {text, field} : null),
    [],
  );
  const fieldMark = (field: QuickAddField) => (errorState?.field === field ? ('warning' as const) : null);
  // "Saved …" after a successful edit save (D9) - shown once the edit form
  // closes, cleared like the "Added" messages on the next typing.
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // What's actually showing - the edit target's own type while one is open
  // (row 1 "forced to match", docs/dev/history/technical-design-unified-quickadd.md
  // §5), the freely-toggled activeType otherwise. Never writes editFields'
  // type back into activeType, so activeType (and therefore the create draft
  // it points at) is exactly where it was before the edit detour once
  // editFields clears again.
  const displayType: QuickAddType = editFields ? editFields.kind : activeType;
  const isEditing = editFields !== null;

  // Context-tag suggestion row (technical-design-context-tags.md §5, §8):
  // loaded once on mount and refreshed after every successful add/edit save
  // (recordTagsUsed may have changed the order). Starts from the last list
  // read this session (render-perf-ab §3 A1), so the mount-time refresh only
  // re-renders if the list changed.
  const [recentTags, setRecentTags] = useState<string[]>(() => getRecentTagsSync() ?? []);
  const applyRecentTags = useCallback(
    (tags: string[]) =>
      setRecentTags(prev => (prev.length === tags.length && prev.every((t, i) => t === tags[i]) ? prev : tags)),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    getRecentTags().then(tags => {
      if (!cancelled) applyRecentTags(tags);
    });
    return () => {
      cancelled = true;
    };
  }, [applyRecentTags]);
  /** Records tags of a saved item, then refreshes the suggestion order. */
  const recordTags = (tags: string[]) => {
    recordTagsUsed(tags).then(() => getRecentTags().then(applyRecentTags));
  };

  // Recognized Project/Area tags are written in upper case in the tag chips
  // - a display transform only, never touching the typed text or matching.
  // "Recognized" uses the same Active-or-On-Hold eligibility
  // resolveAbbrevFileTarget itself applies. Subscribed (not a plain
  // getCachedData() read) since the widget is React.memo'd (render-perf-ab
  // §3 B2): it must re-render by itself when an abbreviation or status
  // changes - but only then (render-perf-ab §7). [] while no cache exists.
  const abbrevItems = useAbbrevItems();
  const recognizedAbbrevTags = new Set(
    abbrevItems
      .filter(item => item.abbrev !== null && (item.status === 'active' || item.status === 'on-hold'))
      .map(item => item.abbrev!.toLowerCase()),
  );

  // A tag naming wherever this item already is/would be created is a no-op,
  // not a destination. In create mode (and on every screen where
  // fixedDestination always names the edited item's own location) this is
  // fixedDestination's own path; Inbox has no path and never carries an
  // abbreviation. While editing, `editingItemPath` - when the caller passes
  // it - overrides that (Daily creates in Inbox but edits entries that live
  // anywhere).
  const fixedExcludePath = fixedDestination.type === 'item' ? fixedDestination.path : null;
  const abbrevExcludePath = isEditing && editingItemPath !== undefined ? editingItemPath : fixedExcludePath;

  /**
   * The text a new draft starts with after an item was added to `target`
   * through its abbreviation tag (technical-design-item-card.md K12): that
   * tag again, as the Project/Area spells it, so a run of items for one
   * place needs it typed once. Tag first with a space after it - a tap into
   * the field puts the cursor at the end, where the next words then go.
   */
  const abbrevPrefill = (target: AbbrevFileMatch | null): string => {
    if (!target) return '';
    const item = abbrevItems.find(i => i.path === target.path);
    return `#${item?.abbrev ?? target.tag} `;
  };

  // Any typing/chip change clears the widget's own slot messages: the ✓
  // goes as soon as the next item is started (§8 Q13), and an error (with
  // its ⚠ mark) as soon as the user starts fixing it.
  const clearTransientMessages = () => {
    if (errorState !== null) setErrorState(null);
    if (savedNote !== null) setSavedNote(null);
  };

  return {
    activeType,
    setActiveType,
    editFields,
    setEditFields,
    displayType,
    isEditing,
    pending,
    setPending,
    errorState,
    setError,
    fieldMark,
    savedNote,
    setSavedNote,
    clearTransientMessages,
    recentTags,
    recordTags,
    abbrevItems,
    recognizedAbbrevTags,
    fixedExcludePath,
    abbrevExcludePath,
    abbrevPrefill,
  };
}

export type QuickAddCore = ReturnType<typeof useQuickAddCore>;
