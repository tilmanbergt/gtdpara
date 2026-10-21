/**
 * Wires the meeting-list toolbar (docs/dev/history/technical-design-meeting-reflection.md
 * §2.6) for one screen: given the selected meeting and the screen's own
 * callbacks, it looks the reflection page up whenever the selection changes
 * (a stale lookup is dropped), opens or creates it on tap - persisting a
 * changed `notePath` through the screen - and returns the toolbar element to
 * pass to `MeetingList`'s / `DayMeetingsPanel`'s `toolbar`.
 */
import React, {useEffect, useState} from 'react';
import {meetingToolbarSlots, emptyToolbarSlots, ReflectionLookup} from '../domain/meetingToolbar';
import {meetingDisplayTitle, MeetingTrackingKind} from '../domain/meetingTracking';
import {EMPTY_NOTE_SETUP_CONFIG, noteSetupConfig} from '../domain/noteSetups';
import {GtdParaSettings} from '../domain/settings';
import {Meeting} from '../domain/types';
import {MeetingNoteInboxInput} from '../storage/meetingNoteAggregate';
import {findReflectionPage, openOrCreateReflectionPage} from '../storage/reflectionPage';
import {errorMessage} from '../utils/errorMessage';
import {log, logWarn} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';
import MeetingToolbar from './MeetingToolbar';
import {useActionError} from './useActionError';
import {useNoteCreateConfirm} from './useNoteCreateConfirm';

export interface ToolbarSelection {
  meeting: Meeting;
  /** The Project's or Area's folder - the Inbox folder for an Inbox meeting. */
  itemPath: string;
  /** Inbox meetings always have their own note. */
  forceOwn?: boolean;
}

export interface MeetingToolbarOptions {
  /** A stable per-screen name for the status slot (`'<screen>.toolbar'`). */
  name: string;
  selection: ToolbarSelection | null;
  settings: GtdParaSettings | null;
  inbox: MeetingNoteInboxInput | null;
  /** Flips the checkpoint on the selected meeting's current stored copy (the screen's `handleToggleMeetingTracking`). */
  onToggle: (kind: MeetingTrackingKind) => void;
  /** Where the screen has a Files pane: arms it for the selected meeting. Absent: no Link file. */
  onArmLink?: () => void;
  /** Saves the selected meeting with a new `notePath` (its page was created for the reflection). */
  persistMeeting: (updated: Meeting) => Promise<void>;
  textColor: string;
  borderColor: string;
}

/** Changes whenever the lookup may give another answer: another meeting, another note link, a renamed or moved meeting. */
function lookupKey(selection: ToolbarSelection | null): string {
  if (!selection) return '';
  const {meeting, itemPath} = selection;
  return [itemPath, meeting.notePath, meeting.date, meeting.title].join('\u0000');
}

export function useMeetingToolbar(options: MeetingToolbarOptions): React.ReactElement {
  const {name, selection, settings, inbox, onToggle, onArmLink, persistMeeting, textColor, borderColor} = options;
  const confirmCreate = useNoteCreateConfirm(`${name}.reflection`);
  const action = useActionError(`${name}.toolbar`, `${name}: toolbar action failed`);
  const [reflection, setReflection] = useState<{key: string; state: ReflectionLookup}>({key: '', state: 'unknown'});
  const [busy, setBusy] = useState(false);
  const key = lookupKey(selection);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setReflection({key, state: 'unknown'});
    findReflectionPage(selection.meeting, selection.itemPath)
      .then(found => {
        if (cancelled) return;
        setReflection({key, state: found.kind});
        requestEinkRefresh();
      })
      .catch(e => {
        if (cancelled) return;
        // The label stays "Reflect ›"; tapping it shows what is wrong.
        logWarn(`${name}: reflection lookup failed`, errorMessage(e));
        setReflection({key, state: 'none'});
      });
    return () => {
      cancelled = true;
    };
    // `selection` itself is a fresh object on every render; `key` says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, name]);

  const setups = settings ? noteSetupConfig(settings) : EMPTY_NOTE_SETUP_CONFIG;
  const state: ReflectionLookup = busy || reflection.key !== key ? 'unknown' : reflection.state;
  const slots = selection
    ? meetingToolbarSlots({meeting: selection.meeting, setups, nowMs: Date.now(), reflection: state, canLink: !!onArmLink})
    : emptyToolbarSlots(!!onArmLink);

  const openReflection = () => {
    if (!selection || !settings) return;
    const {meeting, itemPath, forceOwn} = selection;
    setBusy(true);
    action
      .run(async () => {
        const result = await openOrCreateReflectionPage(meeting, itemPath, settings, inbox, {confirmCreate, forceOwnTarget: forceOwn});
        if (result.cancelled) return;
        if (result.changed) await persistMeeting(result.meeting);
        log(`${name}: reflection opened`, `newMeetingPage=${result.changed}`);
        setReflection({key: lookupKey({...selection, meeting: result.meeting}), state: 'exists'});
      })
      .finally(() => {
        setBusy(false);
        requestEinkRefresh();
      });
  };

  return React.createElement(MeetingToolbar, {
    slots,
    meetingName: selection ? meetingDisplayTitle(selection.meeting) : null,
    onCheckpoint: (kind: MeetingTrackingKind) => {
      onToggle(kind);
      requestEinkRefresh();
    },
    onReflection: openReflection,
    onLink: onArmLink,
    textColor,
    borderColor,
  });
}
