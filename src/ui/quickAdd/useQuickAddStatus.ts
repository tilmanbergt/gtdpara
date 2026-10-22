/**
 * Quick Add's messages in the central status slot
 * (docs/dev/history/technical-design-status-slot.md §7.3): the error, the
 * "Added …"/"Saved …" success, the "New from this" note and the "loop
 * exists" hint. Returns the in-place mark for the Add/Save button: ⚠ for an
 * error that is not about one field, ✓ while a success text shows.
 */
import {useRef} from 'react';
import {useStatus} from '../status/StatusProvider';
import {MeetingDraftState} from './useMeetingDraft';
import {NoteDraftState} from './useNoteDraft';
import {QuickAddCore} from './useQuickAddCore';
import {TaskDraftState} from './useTaskDraft';

/** Per-instance suffix for the status-slot ids (several widgets can be mounted at once). */
let nextQuickAddInstance = 0;

export function useQuickAddStatus(core: QuickAddCore, task: TaskDraftState, meeting: MeetingDraftState, note: NoteDraftState | null) {
  const {displayType, isEditing, errorState, savedNote} = core;
  const justAdded = displayType === 'task' ? task.justAdded : displayType === 'meeting' ? meeting.justAdded : note?.justAdded ?? null;
  const successText = isEditing
    ? null
    : displayType === 'meeting' && meeting.copyNote
      ? null
      : justAdded
        ? displayType === 'meeting' && meeting.addedWhen
          ? `${justAdded} - ${meeting.addedWhen}`
          : justAdded
        : savedNote;
  const infoText = !isEditing && displayType === 'meeting' ? meeting.copyNote : null;
  const dismissSuccess = () => {
    task.setJustAdded(null);
    meeting.setJustAdded(null);
    meeting.setAddedWhen(null);
    note?.setJustAdded(null);
    core.setSavedNote(null);
  };
  const loopMode = task.loopMode;

  const statusId = useRef(`quickadd.${++nextQuickAddInstance}`).current;
  const error = errorState?.text ?? null;
  useStatus(`${statusId}.error`, error ? {kind: 'error', text: error, onDismiss: () => core.setError(null)} : null);
  useStatus(`${statusId}.success`, successText ? {kind: 'success', text: successText, onDismiss: dismissSuccess} : null);
  useStatus(`${statusId}.info`, infoText ? {kind: 'info', text: infoText, onDismiss: () => meeting.setCopyNote(null)} : null);
  useStatus(
    `${statusId}.loop`,
    loopMode.kind === 'exists' && !isEditing ? {kind: 'info', text: `Loop ${loopMode.loop.tag} exists - add words for a todo of it`} : null,
  );

  return errorState && errorState.field === null ? ('warning' as const) : successText ? ('success' as const) : null;
}
