/**
 * The edit-form state of Quick Add (ui/QuickAddWidget.tsx): what an edit of
 * a todo or a meeting holds while it is open, and how it is loaded from the
 * stored item. Kept apart from the widget so the widget stays within its
 * size budget (DEVELOPMENT-POLICY §3).
 */
import {formatMeetingWhen} from '../../domain/meetingTime';
import {isHighlight, setHighlight} from '../../domain/monthHighlight';
import {stripTrackingTags} from '../../domain/meetingTracking';
import {FlowState, Meeting, Task} from '../../domain/types';

export interface TaskEditFields {
  text: string;
  flowState: FlowState;
  waitingOnText: string;
  dueDate: string;
  dueDateOpen: boolean;
  linkedFile: string;
}

export interface MeetingEditFields {
  title: string;
  date: string;
  time: string;
  monthly: boolean;
  linkedFile: string;
}

export type EditFields = {kind: 'task'; fields: TaskEditFields} | {kind: 'meeting'; fields: MeetingEditFields};

/** The edit fields for the item being edited (a todo wins when both are set), or null when nothing is edited. */
export function loadEditFields(editingTask: Task | undefined, editingMeeting: Meeting | undefined): EditFields | null {
  if (editingTask) {
    return {
      kind: 'task',
      fields: {
        text: editingTask.text,
        flowState: editingTask.flowState,
        waitingOnText: editingTask.waitingOn ?? '',
        dueDate: editingTask.dueDate ?? '',
        dueDateOpen: !!editingTask.dueDate,
        linkedFile: editingTask.linkedFile ?? '',
      },
    };
  }
  if (editingMeeting) {
    return {
      kind: 'meeting',
      fields: {
        // `#monthly` is edited through the M toggle, not as title text; `#prepped`/`#reviewed`
        // in the list toolbar (docs/dev/history/technical-design-meeting-reflection.md §2.5).
        title: stripTrackingTags(setHighlight(editingMeeting.title, false)),
        date: editingMeeting.date,
        time: formatMeetingWhen(editingMeeting),
        monthly: isHighlight(editingMeeting),
        linkedFile: editingMeeting.linkedFile ?? '',
      },
    };
  }
  return null;
}
