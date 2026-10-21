/**
 * Wires the meeting-list toolbar (docs/dev/history/technical-design-meeting-reflection.md
 * §2.6) for one screen: given the selected meeting and the screen's own
 * callbacks, it looks the reflection page up whenever the selection changes
 * (ui/useReflectionLookup.ts), opens or creates it on tap - persisting a
 * changed `notePath` through the screen - and returns the toolbar element to
 * pass to `MeetingList`'s / `DayMeetingsPanel`'s `toolbar`.
 */
import React, {useState} from 'react';
import {meetingToolbarSlots, emptyToolbarSlots, ReflectionLookup} from '../domain/meetingToolbar';
import {meetingDisplayTitle, MeetingTrackingKind} from '../domain/meetingTracking';
import {EMPTY_NOTE_SETUP_CONFIG, noteSetupConfig} from '../domain/noteSetups';
import {GtdParaSettings} from '../domain/settings';
import {Meeting} from '../domain/types';
import {MeetingNoteInboxInput} from '../storage/meetingNoteAggregate';
import {openOrCreateReflectionPage} from '../storage/reflectionPage';
import {log} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';
import MeetingToolbar from './MeetingToolbar';
import {useActionError} from './useActionError';
import {useNoteCreateConfirm} from './useNoteCreateConfirm';
import {useReflectionLookup} from './useReflectionLookup';

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

export function useMeetingToolbar(options: MeetingToolbarOptions): React.ReactElement {
  const {name, selection, settings, inbox, onToggle, onArmLink, persistMeeting, textColor, borderColor} = options;
  const confirmCreate = useNoteCreateConfirm(`${name}.reflection`);
  const action = useActionError(`${name}.toolbar`, `${name}: toolbar action failed`);
  const reflection = useReflectionLookup(selection?.meeting ?? null, selection?.itemPath ?? null, name);
  const [busy, setBusy] = useState(false);

  const setups = settings ? noteSetupConfig(settings) : EMPTY_NOTE_SETUP_CONFIG;
  const state: ReflectionLookup = busy ? 'unknown' : reflection.state;
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
        if (!result.changed) reflection.markExists();
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
