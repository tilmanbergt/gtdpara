/**
 * The draft of the settings edited on the Folders, Focus, Calendar and Gmail
 * tabs: loaded once, edited freely, written only by Save (or thrown away by
 * Reset to defaults). Focus counts are edited as text and parsed on save.
 * Settings that take effect at once (switches on Advanced/About, Tag Rules)
 * write themselves and also update this draft, so a later Save keeps them.
 */
import {useEffect, useState} from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../../domain/settings';
import {clearCachedData} from '../../storage/dataCache';
import {clearCachedGmailInbox} from '../../storage/gmailInboxCache';
import {renameInboxFolderForSave} from '../../storage/inboxFolder';
import {loadSettings, saveSettings} from '../../storage/settingsStorage';
import {useErrorStatus, useStatus} from '../../ui/status/StatusProvider';
import {errorMessage} from '../../utils/errorMessage';
import {useEinkRefreshOnLoad} from '../../utils/screenRefresh';

type PathKey = 'projects' | 'areas' | 'inboxFolder' | 'resources' | 'archive';

/** The string-valued settings fields this section edits - deliberately narrower than `keyof GtdParaSettings` now that the type also has the four numeric focus-count fields (edited separately below, see FOCUS_COUNT_FIELDS), so `values[field.key]` stays a plain string for the TextInput `value` prop. */
export type StringSettingKey = 'baseRoot' | 'projectsFolder' | 'areasFolder' | 'inboxFolder' | 'resourcesFolder' | 'archiveFolder' | 'gmailEmail' | 'gmailAppPassword' | 'gmailImapHost';

export const FIELDS: Array<{
  key: StringSettingKey;
  label: string;
  placeholder: string;
  pathKey?: PathKey;
}> = [
  {key: 'baseRoot', label: 'Base root', placeholder: DEFAULT_SETTINGS.baseRoot},
  {
    key: 'projectsFolder',
    label: 'Projects folder',
    placeholder: DEFAULT_SETTINGS.projectsFolder,
    pathKey: 'projects',
  },
  {
    key: 'areasFolder',
    label: 'Areas folder',
    placeholder: DEFAULT_SETTINGS.areasFolder,
    pathKey: 'areas',
  },
  {
    // The Inbox's own folder inside Areas (docs/dev/technical-design-inbox-as-area.md §3.5).
    key: 'inboxFolder',
    label: 'Inbox folder',
    placeholder: DEFAULT_SETTINGS.inboxFolder,
    pathKey: 'inboxFolder',
  },
  {
    key: 'resourcesFolder',
    label: 'Resources folder',
    placeholder: DEFAULT_SETTINGS.resourcesFolder,
    pathKey: 'resources',
  },
  {
    key: 'archiveFolder',
    label: 'Archive folder',
    placeholder: DEFAULT_SETTINGS.archiveFolder,
    pathKey: 'archive',
  },
];

export type FocusCountKey =
  | 'dailyFocusProjectCount'
  | 'dailyFocusAreaCount'
  | 'weeklyFocusProjectCount'
  | 'weeklyFocusAreaCount'
  | 'monthlyFocusProjectCount'
  | 'monthlyFocusAreaCount';

export const FOCUS_COUNT_FIELDS: Array<{key: FocusCountKey; label: string}> = [
  {key: 'dailyFocusProjectCount', label: 'Daily focus — Projects'},
  {key: 'dailyFocusAreaCount', label: 'Daily focus — Areas'},
  {key: 'weeklyFocusProjectCount', label: 'Weekly focus — Projects'},
  {key: 'weeklyFocusAreaCount', label: 'Weekly focus — Areas'},
  {key: 'monthlyFocusProjectCount', label: 'Monthly focus — Projects'},
  {key: 'monthlyFocusAreaCount', label: 'Monthly focus — Areas'},
];

/**
 * Edited as free text (so e.g. clearing the field to retype doesn't fight
 * the input); parsed back to a non-negative integer on save, falling back
 * to `fallback` for anything blank/invalid - same "never resolve to
 * something broken" spirit as the folder-name fields' trim()||default.
 * Used by FOCUS_COUNT_FIELDS.
 */
function parseNonNegativeInt(text: string, fallback: number): number {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function focusCountsToText(settings: GtdParaSettings): Record<FocusCountKey, string> {
  return {
    dailyFocusProjectCount: String(settings.dailyFocusProjectCount),
    dailyFocusAreaCount: String(settings.dailyFocusAreaCount),
    weeklyFocusProjectCount: String(settings.weeklyFocusProjectCount),
    weeklyFocusAreaCount: String(settings.weeklyFocusAreaCount),
    monthlyFocusProjectCount: String(settings.monthlyFocusProjectCount),
    monthlyFocusAreaCount: String(settings.monthlyFocusAreaCount),
  };
}

export function useSettingsDraft() {
  const [values, setValues] = useState<GtdParaSettings>(DEFAULT_SETTINGS);
  const [focusCountText, setFocusCountText] = useState<Record<FocusCountKey, string>>(focusCountsToText(DEFAULT_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  // Extra sentence for the saved message, e.g. after the Inbox folder was renamed.
  const [savedNote, setSavedNote] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  useStatus('Settings.saved', saved ? {kind: 'success', text: `Settings saved.${savedNote}`, onDismiss: () => setSaved(false)} : null);
  useErrorStatus('Settings.saveError', saveError, () => setSaveError(null));
  useErrorStatus('Settings.clipboardError', clipboardError, () => setClipboardError(null));
  useEinkRefreshOnLoad(loading);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then(loaded => {
        if (cancelled) return;
        setValues(loaded);
        setFocusCountText(focusCountsToText(loaded));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (next: Partial<GtdParaSettings>) => {
    setSaved(false);
    setValues(prev => ({...prev, ...next}));
  };
  const update = (key: StringSettingKey, text: string) => patch({[key]: text});
  const updateFocusCount = (key: FocusCountKey, text: string) => {
    setSaved(false);
    setFocusCountText(prev => ({...prev, [key]: text}));
  };

  /** Puts the clipboard's text (trimmed) into a field - the Calendar link and the Gmail app password are pasted, not typed. */
  const pasteInto = async (apply: (text: string) => void) => {
    setClipboardError(null);
    try {
      apply((await Clipboard.getString()).trim());
    } catch (e) {
      setClipboardError(errorMessage(e));
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      // Spread `values` first, then override only the fields this screen
      // edits/parses, so settings edited elsewhere (hideDoneProjectTasks,
      // focusModeActive, ...) keep their value on Save. Blank fields fall
      // back to the default rather than resolving to a broken/empty path
      // segment.
      // Written elsewhere while this screen may be open (the What's-new
      // notice in App.tsx) - keep what is stored, not this screen's copy.
      const storedNow = await loadSettings();
      const cleaned: GtdParaSettings = {
        ...values,
        lastSeenVersion: storedNow.lastSeenVersion,
        baseRoot: values.baseRoot.trim() || DEFAULT_SETTINGS.baseRoot,
        projectsFolder: values.projectsFolder.trim() || DEFAULT_SETTINGS.projectsFolder,
        areasFolder: values.areasFolder.trim() || DEFAULT_SETTINGS.areasFolder,
        resourcesFolder: values.resourcesFolder.trim() || DEFAULT_SETTINGS.resourcesFolder,
        archiveFolder: values.archiveFolder.trim() || DEFAULT_SETTINGS.archiveFolder,
        inboxFolder: values.inboxFolder.trim() || DEFAULT_SETTINGS.inboxFolder,
        // No fallback-to-default here (unlike the folder fields above) - an
        // empty string is itself a valid, meaningful value ("no calendar
        // linked yet"), not a broken path segment to guard against.
        googleCalendarIcsUrl: values.googleCalendarIcsUrl.trim(),
        // Same no-fallback reasoning as googleCalendarIcsUrl above - an
        // empty gmailEmail/gmailAppPassword just means "Gmail inbox review
        // isn't configured yet" (storage/gmailInboxCache.ts's
        // isGmailConfigured), not a broken value to replace with a default.
        gmailEmail: values.gmailEmail.trim(),
        gmailAppPassword: values.gmailAppPassword.trim(),
        gmailImapHost: values.gmailImapHost.trim() || DEFAULT_SETTINGS.gmailImapHost,
        dailyFocusProjectCount: parseNonNegativeInt(
          focusCountText.dailyFocusProjectCount,
          DEFAULT_SETTINGS.dailyFocusProjectCount,
        ),
        dailyFocusAreaCount: parseNonNegativeInt(
          focusCountText.dailyFocusAreaCount,
          DEFAULT_SETTINGS.dailyFocusAreaCount,
        ),
        weeklyFocusProjectCount: parseNonNegativeInt(
          focusCountText.weeklyFocusProjectCount,
          DEFAULT_SETTINGS.weeklyFocusProjectCount,
        ),
        weeklyFocusAreaCount: parseNonNegativeInt(
          focusCountText.weeklyFocusAreaCount,
          DEFAULT_SETTINGS.weeklyFocusAreaCount,
        ),
        monthlyFocusProjectCount: parseNonNegativeInt(
          focusCountText.monthlyFocusProjectCount,
          DEFAULT_SETTINGS.monthlyFocusProjectCount,
        ),
        monthlyFocusAreaCount: parseNonNegativeInt(
          focusCountText.monthlyFocusAreaCount,
          DEFAULT_SETTINGS.monthlyFocusAreaCount,
        ),
      };
      // A new Inbox folder name moves the folder first; a problem throws and nothing is saved.
      const inboxRename = await renameInboxFolderForSave(storedNow, cleaned);
      setSavedNote(
        inboxRename === 'moved'
          ? ' Inbox folder renamed.'
          : inboxRename === 'notMoved'
            ? ' The Inbox folder was not moved, because Base root or Areas changed too.'
            : '',
      );
      await saveSettings(cleaned);
      // The cache was built against whatever paths were in effect before -
      // a changed root would otherwise keep showing stale Projects/Areas
      // (or the wrong folder's data) until someone thought to rebuild it.
      // Note: lowering a focus count here never un-focuses anything already
      // over the new limit (storage/focusSlots.ts) - the cache clear is
      // only about the folder-path fields, focus flags live in each item's
      // own file and are unaffected by a settings save.
      clearCachedData();
      // Unconditional, same as clearCachedData() above - a credentials
      // change, an IMAP host change, or even just clearing the fields
      // should never leave stale/mismatched inbox rows (or rows fetched
      // under the old account) sitting in storage/gmailInboxCache.ts's
      // module-level cache until the next explicit refresh happens to
      // notice.
      clearCachedGmailInbox();
      setValues(cleaned);
      // Reflect back whatever actually got saved (a blank/invalid count
      // fell back to its default) rather than leaving stale/invalid text
      // sitting in the field - same normalize-after-save the folder-name
      // fields already get via setValues(cleaned).
      setFocusCountText(focusCountsToText(cleaned));
      setSaved(true);
    } catch (e) {
      // Show a failed AsyncStorage write, so the button never looks like it
      // did nothing at all.
      setSaveError(errorMessage(e));
    }
  };

  const handleResetDefaults = () => {
    setValues(DEFAULT_SETTINGS);
    setFocusCountText(focusCountsToText(DEFAULT_SETTINGS));
    setSaved(false);
    setSaveError(null);
  };

  return {values, setValues, focusCountText, loading, patch, update, updateFocusCount, pasteInto, handleSave, handleResetDefaults, setSaveError};
}

export type SettingsDraft = ReturnType<typeof useSettingsDraft>;
