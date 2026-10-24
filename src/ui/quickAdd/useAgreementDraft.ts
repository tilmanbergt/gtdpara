/**
 * The Agreement tab of Quick Add (docs/dev/history/technical-design-meetings-0.21.md
 * §5, R20-R22): the create draft (words with their tags, valid till), the
 * edit fields while an agreement is edited or changed, tag chips, and Add,
 * Save and Change. Where the agreement is written - and which meeting it
 * records - the screen decides in its handlers.
 *
 * Like the other drafts, the create draft survives tab switches and edit
 * detours; it is emptied only after a successful add.
 */
import {useState} from 'react';
import {Keyboard} from 'react-native';
import {agreementPlainText} from '../../domain/agreementText';
import {AGREEMENT_CHANGED_TEXT} from '../../domain/fileChangeText';
import {extractContextTags, insertTagAtPosition, removeTagFromText, stripSpaceAfterHash} from '../../domain/markdown';
import {errorMessage} from '../../utils/errorMessage';
import {AgreementEditFields} from './editFields';
import {AgreementDraft, truncateItemName} from './types';
import {QuickAddCore} from './useQuickAddCore';

export interface AgreementHandlers {
  /** Adds a new agreement; `valid` is YYYY-MM-DD or null. Resolves the status text to show ("Agreement added to Coaching"). Present: the tab is offered. */
  onAddAgreement?: (text: string, valid: string | null) => Promise<string | void>;
  /** Saves the edited agreement (the same one); resolve false when it failed. */
  onSaveEditAgreement?: (text: string, valid: string | null) => Promise<void | boolean>;
  /** Ends the agreement being changed and adds this one; resolve false when it failed. */
  onChangeAgreement?: (text: string, valid: string | null) => Promise<void | boolean>;
}

const emptyDraft = (): AgreementDraft => ({text: '', valid: null});

export function useAgreementDraft(core: QuickAddCore, handlers: AgreementHandlers) {
  const {editFields, setEditFields, setError, setPending} = core;
  const [draft, setDraft] = useState<AgreementDraft>(emptyDraft);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [tagPage, setTagPage] = useState(0);
  // The valid-till strip (ui/ValidTillInput.tsx) is open.
  const [validOpen, setValidOpen] = useState(false);
  // The valid-till field takes a typed day (the strip's `…`).
  const [validTyping, setValidTyping] = useState(false);

  const editing = editFields?.kind === 'agreement';
  const fields: AgreementDraft | AgreementEditFields = editFields?.kind === 'agreement' ? editFields.fields : draft;
  const changing = editFields?.kind === 'agreement' && editFields.fields.change;

  const update = (patch: Partial<AgreementDraft>) => {
    if (editing) setEditFields(current => (current?.kind === 'agreement' ? {kind: 'agreement', fields: {...current.fields, ...patch}} : current));
    else setDraft(d => ({...d, ...patch}));
    if (justAdded !== null) setJustAdded(null);
    core.clearTransientMessages();
  };
  const setText = (t: string) => update({text: stripSpaceAfterHash(t)});
  const setValid = (valid: string | null) => update({valid});
  const insertTag = (tag: string) => setText(insertTagAtPosition(fields.text, tag, null).text);
  const removeTag = (tag: string) => setText(removeTagFromText(fields.text, tag));

  const run = (save: () => Promise<void | boolean | string>, done: (text: string | null) => void): Promise<boolean> => {
    setError(null);
    setPending(true);
    return save()
      .then(result => {
        if (result === false) return false;
        done(typeof result === 'string' ? result : null);
        return true;
      })
      .catch(e => {
        setError(errorMessage(e));
        return false;
      })
      .finally(() => setPending(false));
  };

  const submitCreate = () => {
    Keyboard.dismiss();
    const text = draft.text.trim();
    if (!text || !handlers.onAddAgreement) return;
    const add = handlers.onAddAgreement;
    run(
      () => add(text, draft.valid),
      added => {
        setDraft(emptyDraft());
        setTagPage(0);
        setValidOpen(false);
        setJustAdded(added ?? `Added agreement "${truncateItemName(agreementPlainText({text}), 40)}"`);
        core.recordTags(extractContextTags(text));
      },
    );
  };

  /** Save (Edit) or + Add (Change) of the open edit form. */
  const submitEdit = (): Promise<boolean> => {
    if (editFields?.kind !== 'agreement') return Promise.resolve(true);
    Keyboard.dismiss();
    const {text: raw, valid, change} = editFields.fields;
    const text = raw.trim();
    if (!text) {
      setError('An agreement needs some words.', 'text');
      return Promise.resolve(false);
    }
    const save = change ? handlers.onChangeAgreement : handlers.onSaveEditAgreement;
    if (!save) return Promise.resolve(true);
    return run(
      () => save(text, valid),
      () => {
        setValidOpen(false);
        core.setSavedNote(change ? AGREEMENT_CHANGED_TEXT : `Saved agreement "${truncateItemName(agreementPlainText({text}), 40)}"`);
        core.recordTags(extractContextTags(text));
      },
    );
  };

  return {
    draft,
    fields,
    editing,
    changing,
    justAdded,
    setJustAdded,
    tagPage,
    setTagPage,
    validOpen,
    setValidOpen,
    validTyping,
    setValidTyping,
    setText,
    setValid,
    insertTag,
    removeTag,
    submitCreate,
    submitEdit,
  };
}

export type AgreementDraftState = ReturnType<typeof useAgreementDraft>;
