/**
 * The button row under the meeting line (docs/dev/history/technical-design-meetings-0.21.md
 * R4, R5, §4.3): what the chosen moment offers, at most three buttons
 * (domain/meetingMoment.ts's `stripActions`); nothing at all when none
 * applies.
 *
 * - Mark prepped / Mark reviewed tick the meeting's checkpoint;
 * - Note from last meeting › opens the owner's previous meeting's note, and
 *   the panel goes;
 * - Reflect › (Reflection › once it exists) opens or creates the meeting's
 *   Reflection page, and the panel goes; not offered on that page itself;
 * - + Next <type> opens Quick Add's Meeting tab with the thread's or loop's
 *   next meeting (domain/nextMeeting.ts's `nextMeetingOf`).
 */
import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import {EngageOwner, EngageSource, MeetingEntryRef, ownerMeetings} from '../../domain/engageOwner';
import {ENGAGE_TEXT, nextMeetingButtonText} from '../../domain/engageText';
import {hasMeetingAfter, MeetingMoment, previousMeeting, StripAction, stripActions} from '../../domain/meetingMoment';
import {todayIso} from '../../domain/meetingTime';
import {isCheckpointTicked, tracksCheckpoint} from '../../domain/meetingTracking';
import {MeetingSeedFields, nextMeetingOf} from '../../domain/nextMeeting';
import {reflectionPillText} from '../../domain/reflection';
import {getCurrentPageNum} from '../../supernote/currentPage';
import {getCurrentNotePath} from '../../supernote/fileSystem';
import PillButton from '../../ui/PillButton';
import {EntryActions} from '../../ui/useEntryActions';
import {useReflectionLookup} from '../../ui/useReflectionLookup';
import {errorMessage} from '../../utils/errorMessage';
import {log, logWarn} from '../../utils/log';
import {engageStyles as styles} from './engageStyles';

interface Props {
  owner: EngageOwner;
  source: EngageSource;
  page: MeetingEntryRef;
  moment: MeetingMoment;
  actions: Pick<EntryActions, 'toggleTracking' | 'meetingNote' | 'reflection' | 'tracking'>;
  /** "+ Next": the seed and the item the meeting goes to. */
  onNextMeeting: (seed: MeetingSeedFields, itemPath: string) => void;
  /** After a note or the reflection opened: the panel goes. */
  onClose: () => void;
  textColor: string;
  borderColor: string;
}

/** The note page Engage is open on, read once. */
function useOpenPage(): {path: string | null; page: number | null} | null {
  const [shown, setShown] = useState<{path: string | null; page: number | null} | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getCurrentNotePath(), getCurrentPageNum()])
      .then(([path, page]) => !cancelled && setShown({path, page}))
      .catch(e => {
        logWarn('MomentStrip: reading the open page failed', errorMessage(e));
        if (!cancelled) setShown({path: null, page: null});
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return shown;
}

export default function MomentStrip(props: Props): React.JSX.Element | null {
  const {owner, source, page, moment, actions, onNextMeeting, onClose, textColor, borderColor} = props;
  const reflection = useReflectionLookup(page.meeting, page.item.path, 'MomentStrip');
  const shown = useOpenPage();
  const meetings = ownerMeetings(owner, source);
  const prev = previousMeeting(meetings, page);
  const loopOrThread = owner.kind === 'item' ? null : owner;
  const next = loopOrThread && !hasMeetingAfter(meetings, page) ? nextMeetingOf(meetings, loopOrThread.tag, todayIso()) : null;
  const setups = actions.tracking().setups;
  const onReflectionPage =
    reflection.found !== null && !!shown && reflection.found.absolutePath === shown.path && reflection.found.page === shown.page;
  const list = stripActions(moment, {
    tracksPrep: tracksCheckpoint(page.meeting, setups, 'prep'),
    prepped: isCheckpointTicked(page.meeting, 'prep'),
    tracksReview: tracksCheckpoint(page.meeting, setups, 'review'),
    reviewed: isCheckpointTicked(page.meeting, 'review'),
    lastHasNote: !!prev?.meeting.notePath,
    nextNeeded: next !== null,
    onReflectionPage,
  });
  if (list.length === 0) return null;

  const run = (action: StripAction) => {
    log('EngageOverlay: strip', action);
    switch (action) {
      case 'markPrepped':
        actions.toggleTracking(page, 'prep');
        return;
      case 'markReviewed':
        actions.toggleTracking(page, 'review');
        return;
      case 'lastNote':
        if (prev) actions.meetingNote(prev).then(opened => opened && onClose());
        return;
      case 'reflect':
        actions.reflection(page).then(opened => {
          if (!opened) return;
          reflection.markExists();
          onClose();
        });
        return;
      case 'nextMeeting':
        if (next) onNextMeeting(next.seed, next.base.item.path);
        return;
    }
  };
  const label = (action: StripAction): string => {
    switch (action) {
      case 'markPrepped':
        return ENGAGE_TEXT.markPrepped;
      case 'markReviewed':
        return ENGAGE_TEXT.markReviewed;
      case 'lastNote':
        return ENGAGE_TEXT.lastNote;
      case 'reflect':
        return reflectionPillText(reflection.state);
      case 'nextMeeting':
        return nextMeetingButtonText(loopOrThread?.tag.split('/')[0] ?? '');
    }
  };
  return (
    <View style={[styles.buttonRow, styles.stripRow]} testID="moment-strip">
      {list.map(action => (
        <PillButton key={action} label={label(action)} onPress={() => run(action)} textColor={textColor} borderColor={borderColor} />
      ))}
    </View>
  );
}
