/**
 * User-facing texts that announce file changes - before (in a confirmation)
 * and after (in the status slot). One place, so every move, overwrite and
 * delete is described the same way everywhere
 * (docs/dev/history/technical-design-inkhub-submission.md §3.4 and §3.8).
 *
 * Pure: paths come in already shortened for display (e.g. "Note/2 Areas/Health").
 */
import {NoteCreationPlan} from './noteCreationPlan';

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

/** What the status-slot confirm shows before a note is created, recreated or linked (docs/dev/history/technical-design-split-by-tag.md §3.5). */
export interface NoteCreationConfirmText {
  /** One line in the slot (tail-truncated there). */
  text: string;
  /** Tap-to-expand text: the full location, and for recreates what is (not) restored. */
  detail: string;
  /** The confirm button. */
  actionLabel: string;
}

const RECREATE_DETAIL =
  ' Earlier content is not restored. If the deletion was a mistake, restore the file first (e.g. from Supernote Cloud) and tap ✕.';

/**
 * The confirm text for a note plan. `fullDisplay` is the plan's file as a
 * display path (e.g. "Note/2 Areas/Coaching/Meetings/Coaching sabina 2026.note").
 * First-time notes name the deciding Tag Rule, so a misspelt tag (which picks a
 * different rule, file or none) is visible before anything is created.
 */
export function noteCreationConfirmText(plan: NoteCreationPlan, fullDisplay: string): NoteCreationConfirmText {
  const rule = plan.ruleName ? `Rule ${plan.ruleName}: ` : '';
  switch (plan.kind) {
    case 'new-shared-file':
      return {text: `${rule}new file ${plan.file}`, detail: `Creates ${fullDisplay} with a first page for this item.`, actionLabel: 'Create'};
    case 'new-page':
      return {text: `${rule}new page in ${plan.file}`, detail: `Adds a page for this item to ${fullDisplay}.`, actionLabel: 'Add page'};
    case 'new-own-file':
      return {
        text: plan.ruleName ? `${rule}new note ${plan.file}` : `New note ${plan.file}`,
        detail: `Creates ${fullDisplay}.`,
        actionLabel: 'Create',
      };
    case 'link-page':
      return {
        text: `${rule}page "${plan.keyword ?? ''}" already exists in ${plan.file} - link it?`,
        detail: `Links this item to the existing page in ${fullDisplay}. What is written on that page stays.`,
        actionLabel: 'Link',
      };
    case 'recreate-page':
      return {
        text: `Page not found in ${plan.file} (deleted?) - add a new one?`,
        detail: `This item's page is no longer in ${fullDisplay}. Adds a fresh page.${RECREATE_DETAIL}`,
        actionLabel: 'Add page',
      };
    case 'recreate-shared-file':
    case 'recreate-own-file':
      return {
        text: `${plan.file} not found (deleted?) - create it again?`,
        detail: `This item's note ${fullDisplay} no longer exists. Creates it again, empty.${RECREATE_DETAIL}`,
        actionLabel: 'Create',
      };
  }
}

/** A status-slot confirm: one line, tap-to-expand detail, the confirm button (✕ cancels). */
export interface ConfirmText {
  text: string;
  detail: string;
  actionLabel: string;
}

/**
 * Confirm before a todo/meeting with a note moves to another Project, Area or
 * the Inbox (docs/dev/history/technical-design-files-0.6.md §3.4). `what` is "todo" or
 * "meeting", `title` its text, `targetName` where it goes. For an own note,
 * `noteFile` is its file name and `fromDisplay`/`toDisplay` the folders; for
 * a shared page, `noteFile` is the shared note's name and `fromDisplay` its
 * full display path.
 */
export function noteMoveConfirmText(
  args:
    | {kind: 'own'; what: string; title: string; targetName: string; noteFile: string; fromDisplay: string; toDisplay: string}
    | {kind: 'shared'; what: string; title: string; targetName: string; noteFile: string; fromDisplay: string},
): ConfirmText {
  if (args.kind === 'own') {
    return {
      text: `Move "${args.title}" to ${args.targetName}? Its note ${args.noteFile} moves along.`,
      detail: `Moves the ${args.what} to ${args.targetName} and its note ${args.noteFile} from ${args.fromDisplay} to ${args.toDisplay}.`,
      actionLabel: 'Move',
    };
  }
  return {
    text: `Move "${args.title}" to ${args.targetName}? Its page stays in ${args.noteFile}.`,
    detail:
      `Moves the ${args.what} to ${args.targetName}. Its page stays in the shared note ${args.fromDisplay} - ` +
      `pages in a shared note are not moved - and the ${args.what} keeps its link to that page.`,
    actionLabel: 'Move',
  };
}

/** Success text after a move that took the note along. */
export function noteMoveDoneText(title: string, targetName: string): string {
  return `Moved "${title}" to ${targetName}, with its note.`;
}
