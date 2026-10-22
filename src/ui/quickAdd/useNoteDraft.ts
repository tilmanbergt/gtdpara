/**
 * The Note tab of Quick Add: creates a standalone, unlinked .note file
 * (storage/standaloneNotes.ts) - no edit mode, no project.txt/area.txt
 * footprint. Tags aren't a separate input: typing `#tag` into the title (or
 * tapping a tag chip) pins it; the tags are stripped from the title on Add
 * and become real Supernote page keywords (`insertKeyWord`).
 *
 * The destination is the Files pane's currently browsed folder, read at the
 * moment "+ Add" is pressed (`noteFolderPath`), never frozen when the tab
 * was opened.
 */
import {useState} from 'react';
import {Keyboard} from 'react-native';
import {extractContextTags, insertTagAtPosition, removeTagFromText, stripSpaceAfterHash} from '../../domain/markdown';
import {errorMessage} from '../../utils/errorMessage';
import {makeNoteDraft, NoteDraft, truncateItemName} from './types';
import {QuickAddCore} from './useQuickAddCore';

interface Input {
  onAddNote?: (title: string, tags: string[], folderPath: string) => Promise<void>;
  noteFolderPath: string | null;
}

export function useNoteDraft(core: QuickAddCore, {onAddNote, noteFolderPath}: Input) {
  const {setError, setPending} = core;
  const [draft, setDraft] = useState<NoteDraft>(makeNoteDraft);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [tagPage, setTagPage] = useState(0);

  const clearJustAdded = () => {
    if (justAdded !== null) setJustAdded(null);
    core.clearTransientMessages();
  };
  const setTitleRaw = (t: string) => {
    setDraft(d => ({...d, titleRaw: stripSpaceAfterHash(t)}));
    clearJustAdded();
  };
  const insertTag = (tag: string) => setTitleRaw(insertTagAtPosition(draft.titleRaw, tag, null).text);
  const removeTag = (tag: string) => setTitleRaw(removeTagFromText(draft.titleRaw, tag));

  const submitCreate = () => {
    Keyboard.dismiss();
    if (!onAddNote) return;
    const tags = extractContextTags(draft.titleRaw);
    const cleanTitle = tags.reduce((t, tag) => removeTagFromText(t, tag), draft.titleRaw).trim();
    if (!cleanTitle) return;
    if (!noteFolderPath) {
      setError('Switch the Files pane back to Project Files/Area Files to add a note here.');
      return;
    }
    setError(null);
    setPending(true);
    onAddNote(cleanTitle, tags, noteFolderPath)
      .then(() => {
        setDraft(makeNoteDraft());
        setJustAdded(`Created note "${truncateItemName(cleanTitle, 40)}"`);
        setTagPage(0);
        core.recordTags(tags);
      })
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  return {draft, justAdded, setJustAdded, tagPage, setTagPage, setTitleRaw, insertTag, removeTag, submitCreate};
}

export type NoteDraftState = ReturnType<typeof useNoteDraft>;
