/**
 * The Meeting tab of Quick Add: the persistent create draft, the edit
 * fields while a meeting is edited, title/date/time/M changes and tags on
 * whichever of the two is showing - plus Add and Save. Same draft and
 * cursor rules as the Todo tab (ui/quickAdd/useTaskDraft.ts).
 */
import {useEffect, useRef, useState} from 'react';
import {Keyboard, TextInput} from 'react-native';
import {AbbrevFileMatch, resolveAbbrevFileTarget} from '../../domain/abbrev';
import {Selection} from '../../domain/clipboardText';
import {describeAddedDate} from '../../domain/dateLabel';
import {Destination, destinationLabel} from '../../domain/destination';
import {extractContextTags, insertTagAtPosition, removeTagFromText, stripSpaceAfterHash} from '../../domain/markdown';
import {meetingDisplayTitle} from '../../domain/meetingTracking';
import {validateMeetingFields} from '../../domain/meetingTime';
import {setHighlight} from '../../domain/monthHighlight';
import {errorMessage} from '../../utils/errorMessage';
import {clipboardActions} from '../ClipboardStrip';
import {MeetingEditFields} from './editFields';
import {abbrevDestination, makeMeetingDraft, MeetingDraft, MeetingQuickAddFields, truncateItemName} from './types';
import {QuickAddCore} from './useQuickAddCore';

interface Input {
  fixedDestination: Destination;
  initialDate?: string;
  initialMonthly?: boolean;
  /** See QuickAddWidget's `isMeetingDateVisible` prop. */
  isMeetingDateVisible?: (date: string) => boolean;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;
  onSaveEditMeeting?: (fields: MeetingQuickAddFields, nextLinkedFile: string) => Promise<void | boolean>;
  /** Called on every user change of the title (the capture panel's "typed since the seed"). */
  onUserEdit?: () => void;
}

/** A validated meeting ready to hand to the screen, or null after showing the error. */
type Composed = {fields: MeetingQuickAddFields} | null;

export function useMeetingDraft(core: QuickAddCore, input: Input) {
  const {editFields, setEditFields, setError, setPending} = core;
  const {initialDate, initialMonthly} = input;
  const [draft, setDraft] = useState<MeetingDraft>(() => makeMeetingDraft(initialDate, initialMonthly));
  // Follow a changed `initialDate`/`initialMonthly` (the Month view's day
  // panel: tapping another day retargets the draft) - but only while the
  // draft is still untouched, so a half-typed meeting never jumps dates. A
  // title of tags only (the prefilled abbreviation tag) counts as untouched.
  useEffect(() => {
    setDraft(d =>
      d.title.replace(/#\S+/g, '').trim() || d.time.trim()
        ? d
        : {...d, date: initialDate ?? d.date, monthly: initialMonthly ?? d.monthly},
    );
  }, [initialDate, initialMonthly]);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // Set together with justAdded when the added meeting's date is not in the
  // screen's visible list (isMeetingDateVisible); null otherwise.
  const [addedWhen, setAddedWhen] = useState<string | null>(null);
  // The centre note after "New from this" (a complete string, unlike
  // justAdded's bare title). Mutually exclusive with justAdded: showDraft
  // clears the latter, and any edit or Add clears this one.
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [tagPage, setTagPage] = useState(0);
  const [selectionOverride, setSelectionOverride] = useState<Selection>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const lastSelectionRef = useRef<Selection>(null);

  const editing = editFields?.kind === 'meeting';
  const fields: MeetingDraft | MeetingEditFields = editFields?.kind === 'meeting' ? editFields.fields : draft;
  /** The edited item's linked file ('' = none); null while creating. */
  const linkedFile = editFields?.kind === 'meeting' ? editFields.fields.linkedFile : null;
  const abbrevTarget = resolveAbbrevFileTarget(fields.title, core.abbrevItems, core.abbrevExcludePath);

  const clearJustAdded = () => {
    if (justAdded !== null) setJustAdded(null);
    if (addedWhen !== null) setAddedWhen(null);
    if (copyNote !== null) setCopyNote(null);
    core.clearTransientMessages();
  };
  const updateEditField = (patch: Partial<MeetingEditFields>) => {
    setEditFields(current => (current?.kind === 'meeting' ? {kind: 'meeting', fields: {...current.fields, ...patch}} : current));
  };
  const update = (patch: Partial<MeetingDraft>) => {
    if (editing) updateEditField(patch);
    else setDraft(d => ({...d, ...patch}));
  };

  const setTitle = (t: string) => {
    input.onUserEdit?.();
    update({title: stripSpaceAfterHash(t)});
    clearJustAdded();
  };
  const setDate = (d: string) => {
    update({date: d});
    clearJustAdded();
  };
  const setTime = (t: string) => {
    update({time: t});
    clearJustAdded();
  };
  const clearLinkedFile = () => updateEditField({linkedFile: ''});
  const toggleMonthly = () => {
    if (editFields?.kind === 'meeting') updateEditField({monthly: !editFields.fields.monthly});
    else setDraft(d => ({...d, monthly: !d.monthly}));
  };
  const insertTag = (tag: string) => {
    const {text, cursor} = insertTagAtPosition(fields.title, tag, lastSelectionRef.current?.start ?? null);
    setTitle(text);
    const selection = {start: cursor, end: cursor};
    lastSelectionRef.current = selection;
    setSelectionOverride(selection);
  };
  const removeTag = (tag: string) => setTitle(removeTagFromText(fields.title, tag));
  // No setState here on purpose - see useTaskDraft's module comment.
  const onSelectionChange = (selection: Selection) => {
    lastSelectionRef.current = selection;
    if (selectionOverride) setSelectionOverride(null);
  };
  const clipboard = clipboardActions(fields.title, lastSelectionRef, setTitle, setSelectionOverride);

  /** Puts `next` into the create draft and shows the Meeting tab ("New from this", "+ Next", a prefill). */
  const showDraft = (next: MeetingDraft, note: string | null) => {
    setDraft(next);
    lastSelectionRef.current = null;
    setTagPage(0);
    setJustAdded(null);
    setAddedWhen(null);
    setCopyNote(note);
    setError(null);
    core.setActiveType('meeting');
  };

  /**
   * Validates `source` and composes what the screen saves: the M toggle
   * folded in as `#monthly`, and `stripTag` (a matched abbreviation, which
   * did its job picking the destination) removed. Shows the error and
   * returns null when the fields are not valid.
   */
  const compose = (source: MeetingDraft, stripTag: string | null): Composed => {
    const result = validateMeetingFields(source.title, source.date, source.time);
    if (!result.ok) {
      setError(result.error, result.field);
      return null;
    }
    const title = setHighlight(stripTag ? removeTagFromText(source.title.trim(), stripTag) : source.title.trim(), source.monthly);
    return {fields: {title, date: source.date, time: result.time, endTime: result.endTime, days: result.days}};
  };
  /** The status text after a meeting was added at `destination`. */
  const addedText = (title: string, destination: Destination) =>
    `Added meeting "${truncateItemName(meetingDisplayTitle({title}), 40)}" to ${destinationLabel(destination)}`;

  const submitCreate = () => {
    Keyboard.dismiss();
    // The matched abbreviation tag did its job picking the destination; a
    // title that is only that tag counts as empty.
    const source = abbrevTarget ? {...draft, title: removeTagFromText(draft.title.trim(), abbrevTarget.tag)} : draft;
    const composed = compose(source, null);
    if (!composed) return;
    const destination = abbrevTarget ? abbrevDestination(abbrevTarget) : input.fixedDestination;
    const prefill = core.abbrevPrefill(abbrevTarget);
    const addedDate = draft.date;
    setError(null);
    setPending(true);
    input
      .onAddMeeting(composed.fields, destination)
      .then(() => {
        setDraft({...makeMeetingDraft(initialDate, initialMonthly), title: prefill});
        const end = {start: prefill.length, end: prefill.length};
        lastSelectionRef.current = prefill ? end : null;
        if (prefill) setSelectionOverride(end);
        setCopyNote(null);
        setJustAdded(addedText(composed.fields.title, destination));
        const visible = input.isMeetingDateVisible;
        setAddedWhen(visible && !visible(addedDate) ? describeAddedDate(addedDate) : null);
        setTagPage(0);
        core.recordTags(extractContextTags(composed.fields.title));
      })
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  const submitEdit = (): Promise<boolean> => {
    if (!editFields || editFields.kind !== 'meeting') return Promise.resolve(true);
    Keyboard.dismiss();
    const composed = compose(editFields.fields, null);
    if (!composed) return Promise.resolve(false);
    const title = composed.fields.title;
    setError(null);
    setPending(true);
    return (input.onSaveEditMeeting ?? (() => Promise.resolve()))(composed.fields, editFields.fields.linkedFile)
      .then(saved => {
        if (saved === false) return false;
        core.setSavedNote(`Saved meeting "${truncateItemName(meetingDisplayTitle({title}), 40)}"`);
        core.recordTags(extractContextTags(title));
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
    if (editFields?.kind !== 'meeting') return null;
    const composed = compose(editFields.fields, target.tag);
    if (!composed) return null;
    return {
      payload: {kind: 'meeting' as const, fields: composed.fields, linkedFile: editFields.fields.linkedFile},
      tags: extractContextTags(composed.fields.title),
    };
  };

  return {
    draft,
    setDraft,
    fields,
    editing,
    linkedFile,
    abbrevTarget,
    justAdded,
    setJustAdded,
    addedWhen,
    setAddedWhen,
    copyNote,
    setCopyNote,
    tagPage,
    setTagPage,
    selectionOverride,
    inputFocused,
    setInputFocused,
    inputRef,
    lastSelectionRef,
    clearJustAdded,
    setTitle,
    setDate,
    setTime,
    clearLinkedFile,
    toggleMonthly,
    insertTag,
    removeTag,
    onSelectionChange,
    clipboard,
    showDraft,
    compose,
    addedText,
    submitCreate,
    submitEdit,
    quickFilePayload,
  };
}

export type MeetingDraftState = ReturnType<typeof useMeetingDraft>;
