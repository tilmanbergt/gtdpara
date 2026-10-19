/**
 * Where the Engage panel's lines lead
 * (docs/dev/history/technical-design-engage-in-context.md §2.8, §2.9):
 * - "Next here" opens the meeting's note (or creates it after the usual
 *   confirmation); once a note opened, it is in front and the panel goes;
 * - "Also here"'s "someday" leaves to Review's "Someday / Maybe", filtered to
 *   the owner's Someday/Maybe todos (keys taken now, the frozen-list posture);
 * - "Overview ›" leaves to the owner's overview, or its Project/Area page.
 * The panel only names the place (`EngageExit`); App goes there.
 */
import {EngageExit} from '../../domain/engageFlow';
import {EngageOwner, EngageSource, MeetingEntryRef, ownerTitle, ownerTodos} from '../../domain/engageOwner';
import {isSomedayMaybe} from '../../domain/flowState';
import {EntryActions} from '../../ui/useEntryActions';
import {log} from '../../utils/log';

export interface EngageExits {
  openNextMeeting: (entry: MeetingEntryRef) => Promise<void>;
  openSomeday: () => void;
  openOverview: () => void;
}

export function useEngageExits(
  owner: EngageOwner | null,
  source: EngageSource | null,
  actions: Pick<EntryActions, 'meetingNote'>,
  onExit: (exit: EngageExit) => void,
  onClose: () => void,
): EngageExits {
  return {
    openNextMeeting: async entry => {
      log('EngageOverlay: action', 'nextMeeting');
      if (await actions.meetingNote(entry)) onClose();
    },
    openSomeday: () => {
      if (!owner || !source) return;
      const keys = ownerTodos(owner, source)
        .filter(todo => isSomedayMaybe(todo.task))
        .map(todo => `${todo.item.path}#${todo.taskIndex}`);
      log('EngageOverlay: action', 'someday', 'count=' + keys.length);
      onExit({kind: 'someday', owner, label: ownerTitle(owner, source).name, keys});
    },
    openOverview: () => {
      if (!owner) return;
      log('EngageOverlay: action', 'overview', owner.kind);
      onExit({kind: 'overview', owner});
    },
  };
}
