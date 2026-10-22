/**
 * Wires the meeting card (docs/dev/history/technical-design-item-card.md §6)
 * for one screen: given the selected meeting and the screen's own handlers,
 * it builds the card's model, looks the reflection page up whenever the
 * selection changes (ui/useReflectionLookup.ts), and turns each card button
 * into a write through the screen's `updateMeeting` - which changes the
 * meeting's current stored copy, never the copy the card was drawn from.
 * Returns what QuickAddWidget's `meetingCard` prop takes.
 */
import {useState} from 'react';
import {meetingCardModel, MeetingCardModel, ReflectionLookup} from '../../domain/itemCard';
import {deriveMeetingFields} from '../../domain/markdown';
import {isHighlight, setHighlight} from '../../domain/monthHighlight';
import {meetingDisplayTitle, toggleMeetingTracking} from '../../domain/meetingTracking';
import {EMPTY_NOTE_SETUP_CONFIG, noteSetupConfig} from '../../domain/noteSetups';
import {GtdParaSettings} from '../../domain/settings';
import {Meeting} from '../../domain/types';
import {MeetingNoteInboxInput} from '../../storage/meetingNoteAggregate';
import {openOrCreateReflectionPage} from '../../storage/reflectionPage';
import {log} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {openOverview} from '../overviewStore';
import {useActionError} from '../useActionError';
import {useNoteCreateConfirm} from '../useNoteCreateConfirm';
import {useReflectionLookup} from '../useReflectionLookup';
import {useStatusConfirm} from '../useStatusConfirm';

export interface CardSelection {
  meeting: Meeting;
  /** The Project's or Area's folder - the Inbox folder for an Inbox meeting. */
  itemPath: string;
  /** The Project's or Area's name, or "Inbox". */
  ownerName: string;
  /** An Inbox meeting: always its own note, no owner path for overviews. */
  inbox?: boolean;
}

export interface MeetingCardOptions {
  /** A stable per-screen name for logs and the status slot (`'<screen>.card'`). */
  name: string;
  selection: CardSelection | null;
  settings: GtdParaSettings | null;
  inbox: MeetingNoteInboxInput | null;
  /** Changes the selected meeting's current stored copy and saves it. */
  updateMeeting: (change: (meeting: Meeting) => Meeting) => Promise<void>;
  /** Opens the meeting's note, creating it first when there is none. */
  onNote: () => void;
  onOpenFile?: (linkedFile: string) => void;
  /** Where the screen has a Files pane: arms it to link a file. Absent: no +clip. */
  onArmLink?: () => void;
  /** Where the screen has a Files pane: arms it to refile. Absent: the area chip has no arrow. */
  onArmRefile?: () => void;
  /** Opens the owning Project or Area. Absent: the chip is a plain label (already there). */
  onOpenOwner?: () => void;
  /** The card's Edit. */
  onEdit: () => void;
  /** The card's ✕. */
  onClose: () => void;
}

/** What the card shows and does; QuickAddWidget adds "New from this". */
export interface MeetingCardData {
  meeting: Meeting;
  model: MeetingCardModel;
  busy: boolean;
  onEdit: () => void;
  onClose: () => void;
  onCheckpoint: () => void;
  onMonthly: () => void;
  onNote: () => void;
  onReflect: () => void;
  onOpenFile?: () => void;
  onUnlink: () => void;
  onLink?: () => void;
  onOpenOwner?: () => void;
  onRefile?: () => void;
  onCancelMeeting: () => void;
  onOpenThread: () => void;
}

export function useMeetingCard(options: MeetingCardOptions): MeetingCardData | null {
  const {name, selection, settings, inbox, updateMeeting} = options;
  const confirmCreate = useNoteCreateConfirm(`${name}.reflection`);
  const confirm = useStatusConfirm(`${name}.cancelMeeting`);
  const action = useActionError(`${name}.card`, `${name}: card action failed`);
  const reflection = useReflectionLookup(selection?.meeting ?? null, selection?.itemPath ?? null, name);
  const [busy, setBusy] = useState(false);
  if (!selection) return null;

  const {meeting, itemPath} = selection;
  const setups = settings ? noteSetupConfig(settings) : EMPTY_NOTE_SETUP_CONFIG;
  const state: ReflectionLookup = busy ? 'unknown' : reflection.state;
  const model = meetingCardModel({
    meeting,
    setups,
    nowMs: Date.now(),
    reflection: state,
    ownerName: selection.ownerName,
    canLink: !!options.onArmLink,
    canRefile: !!options.onArmRefile,
  });

  /** Runs one card write; the e-ink screen refreshes afterwards. */
  const write = (label: string, change: (m: Meeting) => Meeting) => {
    action
      .run(async () => {
        await updateMeeting(change);
        log(`${name}: card ${label}`);
      })
      .finally(requestEinkRefresh);
  };

  const onReflect = () => {
    if (!settings) return;
    setBusy(true);
    action
      .run(async () => {
        const result = await openOrCreateReflectionPage(meeting, itemPath, settings, inbox, {confirmCreate, forceOwnTarget: selection.inbox});
        if (result.cancelled) return;
        if (result.changed) await updateMeeting(m => ({...m, notePath: result.meeting.notePath}));
        log(`${name}: reflection opened`, `newMeetingPage=${result.changed}`);
        if (!result.changed) reflection.markExists();
      })
      .finally(() => {
        setBusy(false);
        requestEinkRefresh();
      });
  };

  const onCancelMeeting = () => {
    action.run(async () => {
      const ok = await confirm({
        text: `Cancel "${meetingDisplayTitle(meeting)}"?`,
        detail: 'It stays in the file, marked as cancelled.',
        actionLabel: 'Cancel meeting',
      });
      if (!ok) return;
      await updateMeeting(m => ({...m, cancelled: true}));
      log(`${name}: card cancelled the meeting`);
      requestEinkRefresh();
    });
  };

  const linkedFile = meeting.linkedFile;
  return {
    meeting,
    model,
    busy,
    onEdit: options.onEdit,
    onClose: options.onClose,
    onCheckpoint: () => {
      const kind = model.checkpoint?.kind;
      if (kind) write(`ticked ${kind}`, m => toggleMeetingTracking(m, kind));
    },
    onMonthly: () =>
      write('switched M', m => {
        const title = setHighlight(m.title, !isHighlight(m));
        return {...m, title, ...deriveMeetingFields(title)};
      }),
    onNote: options.onNote,
    onReflect,
    onOpenFile: linkedFile && options.onOpenFile ? () => options.onOpenFile?.(linkedFile) : undefined,
    onUnlink: () => write('unlinked the file', m => ({...m, linkedFile: ''})),
    onLink: options.onArmLink,
    onOpenOwner: options.onOpenOwner,
    onRefile: options.onArmRefile,
    onCancelMeeting,
    onOpenThread: () => {
      if (model.thread) openOverview({tag: model.thread.tag, ownerPath: selection.inbox ? null : itemPath});
    },
  };
}
