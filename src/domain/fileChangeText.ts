/**
 * User-facing texts that announce file changes - before (in a confirmation)
 * and after (in the status slot). One place, so every move, overwrite and
 * delete is described the same way everywhere
 * (docs/dev/technical-design-inkhub-submission.md §3.4 and §3.8).
 *
 * Pure: paths come in already shortened for display (e.g. "Note/2 Areas/Health").
 */

/** Confirmation addendum when an archive merges into an existing folder and leaves the source folder empty. */
export function emptyFolderConfirmNote(sourceDisplay: string, targetDisplay: string): string {
  return (
    ` ${targetDisplay} already exists, so the contents are added to it. The then-empty folder ${sourceDisplay}` +
    ' is deleted - the Supernote asks you once to allow deleting. Say no and the empty folder simply stays.'
  );
}

/** Success text after an archive move. */
export function archiveDoneText(name: string, targetDisplay: string, keptEmptyFolderDisplay: string | null): string {
  const kept = keptEmptyFolderDisplay
    ? ` The empty folder ${keptEmptyFolderDisplay} was kept - you can delete it in the file manager.`
    : '';
  return `Moved "${name}" to ${targetDisplay}.${kept}`;
}

/** Confirmation text before a PDF that already exists is replaced. */
export function replacePdfConfirmText(fileDisplay: string): string {
  return `Replace ${fileDisplay}? The existing PDF is overwritten with the new one.`;
}
