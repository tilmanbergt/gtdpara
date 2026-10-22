/**
 * The Todo tab of Quick Add: the persistent create draft, the edit fields
 * while a todo is edited, and everything typing, tags, flow chips and the
 * due date do to whichever of the two is showing - plus Add and Save.
 *
 * The draft is created once and never reset by switching tabs or by an
 * edit starting/ending elsewhere on the same screen, so "flip tabs
 * mid-typing, come back, draft's still there" and "an edit detour doesn't
 * lose what you were adding" both hold for free
 * (docs/dev/history/technical-design-unified-quickadd.md §5).
 *
 * The cursor position is kept in a ref (`lastSelectionRef`), never state:
 * onSelectionChange fires on almost every cursor movement, and a re-render
 * on each one breaks native text selection on Android (see
 * domain/clipboardText.ts). `selectionOverride` is set for exactly one
 * render after a tag insert, so the field's `selection` prop can move the
 * cursor past the tag, then released by the field's own onSelectionChange.
 */
import {useEffect, useRef, useState} from 'react';
import {Keyboard, TextInput} from 'react-native';
import {AbbrevFileMatch, resolveAbbrevFileTarget} from '../../domain/abbrev';
import {Selection} from '../../domain/clipboardText';
import {Destination, destinationLabel} from '../../domain/destination';
import {extractContextTags, insertTagAtPosition, removeTagFromText, stripSpaceAfterHash} from '../../domain/markdown';
import {composeTaskText} from '../../domain/quickAddCompose';
import {FlowState} from '../../domain/types';
import {errorMessage} from '../../utils/errorMessage';
import {clipboardActions} from '../ClipboardStrip';
import {DateInputHandle} from '../DateInput';
import {TaskEditFields} from './editFields';
import {abbrevDestination, makeTaskDraft, TaskDraft, truncateItemName} from './types';
import {QuickAddCore} from './useQuickAddCore';
import {useLoopMode} from './useLoopMode';

interface Input {
  fixedDestination: Destination;
  editingItemPath?: string | null;
  /** The edited todo stands for a loop. */
  editingLoop: boolean;
  /** False in the capture panel: no loop handling there. */
  loopsEnabled: boolean;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onSaveEditTask?: (nextText: string, nextLinkedFile: string) => Promise<void | boolean>;
  /** Called on every user change of the text (the capture panel's "typed since the seed"). */
  onUserEdit?: () => void;
}

export function useTaskDraft(core: QuickAddCore, input: Input) {
  const {editFields, setEditFields, setError, setPending} = core;
  const [draft, setDraft] = useState<TaskDraft>(makeTaskDraft);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // Lifted out of TagChips because for Todo the page also decides whether
  // FlowStateChips shows at all (see TagChips.tsx's doc comment) - reset to
  // 0 wherever the create/edit target changes.
  const [tagPage, setTagPage] = useState(0);
  const [selectionOverride, setSelectionOverride] = useState<Selection>(null);
  // Whether the text field has focus - shows the Select All/Copy/Cut/Paste strip.
  const [inputFocused, setInputFocused] = useState(false);
  // Rows 2/3 stay mounted the whole time, so `autoFocus` can't grab focus
  // when an edit starts; the edit session focuses through this ref instead.
  const inputRef = useRef<TextInput>(null);
  const lastSelectionRef = useRef<Selection>(null);
  // The due field only exists once unfolded, so focusing it right after the
  // 📅 tap has to wait for that render to commit.
  const dueInputRef = useRef<DateInputHandle>(null);
  const [dueFocusRequested, setDueFocusRequested] = useState(false);
  useEffect(() => {
    if (!dueFocusRequested) return;
    dueInputRef.current?.focus();
    setDueFocusRequested(false);
  }, [dueFocusRequested]);

  const editing = editFields?.kind === 'task';
  const fields: TaskDraft | TaskEditFields = editFields?.kind === 'task' ? editFields.fields : draft;
  /** The edited item's linked file ('' = none); null while creating. */
  const linkedFile = editFields?.kind === 'task' ? editFields.fields.linkedFile : null;
  // A todo that is only a loop tag starts the loop (ui/quickAdd/useLoopMode.ts).
  const loopMode = useLoopMode({
    active: core.displayType === 'task' && input.loopsEnabled,
    fields,
    editing,
    editingLoop: input.editingLoop && editing,
    fixedDestination: input.fixedDestination,
    editingItemPath: input.editingItemPath,
    abbrevItems: core.abbrevItems,
  });
  // The one Project/Area a recognized #tag in the showing text resolves to
  // (docs/dev/history/technical-design-abbrev-quick-file.md) - see
  // domain/abbrev.ts for the match/status/self-exclude rules.
  const abbrevTarget = resolveAbbrevFileTarget(fields.text, core.abbrevItems, core.abbrevExcludePath);

  const clearJustAdded = () => {
    if (justAdded !== null) setJustAdded(null);
    core.clearTransientMessages();
  };
  const updateEditField = (patch: Partial<TaskEditFields>) => {
    setEditFields(current => (current?.kind === 'task' ? {kind: 'task', fields: {...current.fields, ...patch}} : current));
  };
  const update = (patch: Partial<TaskDraft>) => {
    if (editing) updateEditField(patch);
    else setDraft(d => ({...d, ...patch}));
  };

  const setText = (t: string) => {
    input.onUserEdit?.();
    update({text: stripSpaceAfterHash(t)});
    clearJustAdded();
  };
  const setDueDate = (d: string) => {
    update({dueDate: d});
    clearJustAdded();
  };
  const openDueDate = () => {
    update({dueDateOpen: true});
    // Focus the freshly unfolded field so its -1/Today/+1/+7 strip shows at once.
    setDueFocusRequested(true);
  };
  const setFlowState = (next: FlowState) => {
    update({flowState: next});
    clearJustAdded();
  };
  const setWaitingOn = (w: string) => {
    update({waitingOnText: stripSpaceAfterHash(w)});
    clearJustAdded();
  };
  const clearLinkedFile = () => updateEditField({linkedFile: ''});
  const insertTag = (tag: string) => {
    const {text, cursor} = insertTagAtPosition(fields.text, tag, lastSelectionRef.current?.start ?? null);
    setText(text);
    const selection = {start: cursor, end: cursor};
    lastSelectionRef.current = selection;
    setSelectionOverride(selection);
  };
  const removeTag = (tag: string) => setText(removeTagFromText(fields.text, tag));
  const onSelectionChange = (selection: Selection) => {
    lastSelectionRef.current = selection;
    if (selectionOverride) setSelectionOverride(null);
  };
  // Custom Select All/Copy/Cut/Paste (domain/clipboardText.ts says why).
  const clipboard = clipboardActions(fields.text, lastSelectionRef, setText, setSelectionOverride);

  /** Empties the draft's text and chips after a save (the unfolded due field stays). */
  const resetAfterAdd = () => {
    setDraft(d => ({...d, text: '', flowState: null, waitingOnText: '', dueDate: ''}));
    lastSelectionRef.current = null;
  };

  const submitCreate = () => {
    Keyboard.dismiss();
    const trimmed = draft.text.trim();
    // The words without the abbreviation tag: a draft that is only the
    // prefilled tag is not a todo yet.
    const words = abbrevTarget ? removeTagFromText(trimmed, abbrevTarget.tag).trim() : trimmed;
    if (!words) return;
    // Flow-state, due and - for abbreviation quick-file - removing the
    // matched #tag, which did its job picking the destination.
    const finalText = composeTaskText(draft, abbrevTarget ? abbrevTarget.tag : null);
    if (loopMode.kind === 'exists') return;
    const startsLoop = loopMode.kind === 'add';
    const destination = abbrevTarget ? abbrevDestination(abbrevTarget) : input.fixedDestination;
    const prefill = core.abbrevPrefill(abbrevTarget);
    setError(null);
    setPending(true);
    input
      .onAddTask(finalText, destination)
      .then(() => {
        resetAfterAdd();
        if (startsLoop) return;
        if (prefill) {
          setDraft(d => ({...d, text: prefill}));
          const end = {start: prefill.length, end: prefill.length};
          lastSelectionRef.current = end;
          setSelectionOverride(end);
        }
        setJustAdded(`Added todo "${truncateItemName(words, 40)}" to ${destinationLabel(destination)}`);
        setTagPage(0);
        core.recordTags(extractContextTags(finalText));
      })
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  const submitEdit = (): Promise<boolean> => {
    if (!editFields || editFields.kind !== 'task') return Promise.resolve(true);
    Keyboard.dismiss();
    const trimmed = editFields.fields.text.trim();
    if (!trimmed) {
      setError('A todo needs some text.', 'text');
      return Promise.resolve(false);
    }
    const finalText = composeTaskText(editFields.fields);
    setError(null);
    setPending(true);
    return (input.onSaveEditTask ?? (() => Promise.resolve()))(finalText, editFields.fields.linkedFile)
      .then(result => {
        if (result === false) return false;
        core.setSavedNote(`Saved ${loopMode.kind === 'loop' ? 'loop' : 'todo'} "${truncateItemName(trimmed, 40)}"`);
        core.recordTags(extractContextTags(finalText));
        return true;
      })
      .catch(e => {
        setError(errorMessage(e));
        return false;
      })
      .finally(() => setPending(false));
  };

  /** Edit-mode quick-file: Save's composition plus the matched tag stripped. */
  const quickFilePayload = (target: AbbrevFileMatch) => {
    if (editFields?.kind !== 'task' || !editFields.fields.text.trim()) return null;
    const text = composeTaskText(editFields.fields, target.tag);
    return {payload: {kind: 'task' as const, text, linkedFile: editFields.fields.linkedFile}, tags: extractContextTags(text)};
  };

  return {
    draft,
    setDraft,
    fields,
    editing,
    linkedFile,
    loopMode,
    abbrevTarget,
    justAdded,
    setJustAdded,
    tagPage,
    setTagPage,
    selectionOverride,
    inputFocused,
    setInputFocused,
    inputRef,
    lastSelectionRef,
    dueInputRef,
    clearJustAdded,
    setText,
    setDueDate,
    openDueDate,
    setFlowState,
    setWaitingOn,
    clearLinkedFile,
    insertTag,
    removeTag,
    onSelectionChange,
    clipboard,
    resetAfterAdd,
    submitCreate,
    submitEdit,
    quickFilePayload,
  };
}

export type TaskDraftState = ReturnType<typeof useTaskDraft>;
