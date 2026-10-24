/**
 * Quick Add's edit session: loads the edit fields when an edit target
 * arrives or changes, focuses the field, and saves pending changes before
 * the screen moves on (docs/dev/history/technical-design-meeting-lists.md
 * §10) or when the widget goes away.
 *
 * No key-remount: remounting the widget would wipe the create drafts, so the
 * fields are seeded here instead. Loading reacts only to the target
 * *transitioning* between unset and set, or to its `key` changing - never to
 * the target being a fresh object: callers hand in a freshly spread item on
 * every render (e.g. `{...task, text: displayTaskText(...)}`), and reloading
 * on that would clobber whatever the user just typed.
 */
import {useEffect, useRef, useState} from 'react';
import {Keyboard} from 'react-native';
import {useOnScreenHide} from '../screenActivity';
import {useStableCallback} from '../useStableCallback';
import {EditFields, loadAgreementEditFields, loadEditFields} from './editFields';
import {QuickAddEditTarget} from './types';
import {AgreementDraftState} from './useAgreementDraft';
import {MeetingDraftState} from './useMeetingDraft';
import {QuickAddCore} from './useQuickAddCore';
import {TaskDraftState} from './useTaskDraft';

interface Input {
  editTarget?: QuickAddEditTarget | null;
  /** Receives the flush (see QuickAddWidget's `flushEditRef` prop). */
  flushEditRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  onCancelEdit?: () => void;
  /** The Agreement tab, where the widget has one. */
  agreement?: AgreementDraftState;
}

function fieldsOf(target: QuickAddEditTarget): EditFields | null {
  switch (target.kind) {
    case 'meeting':
      return loadEditFields(undefined, target.meeting);
    case 'agreement':
      return loadAgreementEditFields(target.agreement.agreement, false);
    case 'agreementChange':
      return loadAgreementEditFields(target.replaces.agreement, true);
    default:
      return loadEditFields(target.task, undefined);
  }
}

export function useEditSession(core: QuickAddCore, task: TaskDraftState, meeting: MeetingDraftState, input: Input) {
  const {editTarget, flushEditRef, onCancelEdit, agreement} = input;
  const {editFields, setEditFields, setError, setSavedNote} = core;
  const {lastSelectionRef: taskSelectionRef, setTagPage: setTaskTagPage, inputRef: taskInputRef} = task;
  const {lastSelectionRef: meetingSelectionRef, setTagPage: setMeetingTagPage, inputRef: meetingInputRef} = meeting;

  const wasEditingRef = useRef(false);
  // The target the fields were last loaded from, and those fields as loaded
  // (JSON) - `flush` compares against it to save only real changes.
  const lastTargetKeyRef = useRef<string | null | undefined>(undefined);
  const loadedFieldsRef = useRef<string | null>(null);
  // Which field to focus once a fresh edit has rendered (see below).
  const [focusRequest, setFocusRequest] = useState<'task' | 'meeting' | null>(null);
  useEffect(() => {
    // A target shown as card is not edited: no fields, nothing to save.
    const isEditingNow = !!editTarget && editTarget.mode === 'edit';
    const targetChanged = isEditingNow && editTarget.key !== lastTargetKeyRef.current;
    if (isEditingNow && (!wasEditingRef.current || targetChanged)) {
      // A fresh target: the previous field's cursor position means nothing for it.
      taskSelectionRef.current = null;
      meetingSelectionRef.current = null;
      const loaded = fieldsOf(editTarget);
      setEditFields(loaded);
      loadedFieldsRef.current = loaded ? JSON.stringify(loaded.fields) : null;
      // The agreement field (ClipboardTextInput) is not focused from outside.
      if (loaded && loaded.kind !== 'agreement' && !wasEditingRef.current) setFocusRequest(loaded.kind);
      setError(null);
      setSavedNote(null);
      setTaskTagPage(0);
      setMeetingTagPage(0);
    } else if (!isEditingNow && wasEditingRef.current) {
      setEditFields(null);
      loadedFieldsRef.current = null;
      setError(null);
      setTaskTagPage(0);
      setMeetingTagPage(0);
    }
    wasEditingRef.current = isEditingNow;
    lastTargetKeyRef.current = isEditingNow ? editTarget.key : undefined;
  }, [
    editTarget,
    taskSelectionRef,
    meetingSelectionRef,
    setEditFields,
    setError,
    setSavedNote,
    setTaskTagPage,
    setMeetingTagPage,
  ]);

  // Focusing has to wait for the render in which the edit fields took
  // effect: when the loading effect runs, the row's `display: none -> flex`
  // toggle hasn't committed yet, and a same-tick `.focus()` can land on a
  // still-hidden native view and silently do nothing. Only a fresh edit
  // asks for focus - switching targets or retyping never steals it back.
  useEffect(() => {
    if (!focusRequest) return;
    (focusRequest === 'task' ? taskInputRef : meetingInputRef).current?.focus();
    setFocusRequest(null);
  }, [focusRequest, taskInputRef, meetingInputRef]);

  /**
   * Save-then-switch: saves the current edit target's pending changes -
   * only if something changed - and resolves whether the caller may move on
   * (false = validation or save failed; the error is showing and the edit
   * stays open).
   */
  const flush = useStableCallback((): Promise<boolean> => {
    if (!editFields) return Promise.resolve(true);
    if (JSON.stringify(editFields.fields) === loadedFieldsRef.current) return Promise.resolve(true);
    if (editFields.kind === 'agreement') {
      // A Change adds a new agreement: like a new item's draft, never saved implicitly.
      return editFields.fields.change || !agreement ? Promise.resolve(true) : agreement.submitEdit();
    }
    return editFields.kind === 'task' ? task.submitEdit() : meeting.submitEdit();
  });
  useEffect(() => {
    if (!flushEditRef) return;
    flushEditRef.current = flush;
    return () => {
      flushEditRef.current = null;
    };
  }, [flushEditRef, flush]);
  // Unmount while editing (tab/screen left): save what changed.
  useEffect(
    () => () => {
      flush().catch(() => undefined); // silent: the flush shows its own errors
    },
    [flush],
  );
  // Kept tab hidden (docs/dev/history/technical-design-keep-tabs-alive.md
  // §4.1, D2): same as leaving the tab - save what changed, then close the
  // edit. If the save fails, the edit stays open and its error shows when
  // the tab is shown again. Drafts of new items are left as they are (D3).
  useOnScreenHide(() => {
    Keyboard.dismiss();
    if (!editFields) return;
    flush()
      .then(ok => {
        if (ok) onCancelEdit?.();
      })
      .catch(() => undefined); // silent: the flush shows its own errors
  });
}
