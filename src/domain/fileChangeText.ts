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
 * First-time notes name the deciding Note setup, so a misspelt tag (which picks a
 * different setup, file or none) is visible before anything is created.
 */
export function noteCreationConfirmText(plan: NoteCreationPlan, fullDisplay: string): NoteCreationConfirmText {
  const rule = plan.setupName ? `${plan.setupName}: ` : '';
  switch (plan.kind) {
    case 'new-shared-file':
      return {text: `${rule}new file ${plan.file}`, detail: `Creates ${fullDisplay} with a first page for this item.`, actionLabel: 'Create'};
    case 'new-page':
      return {text: `${rule}new page in ${plan.file}`, detail: `Adds a page for this item to ${fullDisplay}.`, actionLabel: 'Add page'};
    case 'new-own-file':
      return {
        text: plan.setupName ? `${rule}new note ${plan.file}` : `New note ${plan.file}`,
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

/** A note confirm with its choice of places: the buttons, the first one the plan's own action. */
export interface NoteChoiceText {
  text: string;
  detail: string;
  labels: string[];
}

/** One place in the choice's detail: "Sparring: new page in Sparring/sparring peter 2026.note". */
function placeLine(plan: NoteCreationPlan): string {
  return noteCreationConfirmText(plan, plan.file).text;
}

/** The button of an alternative: "In Sparring", or "Own note" for the item's own note. */
export function alternativeLabel(plan: NoteCreationPlan): string {
  return plan.kind === 'new-own-file' ? 'Own note' : `In ${plan.setupName ?? 'Default'}`;
}

/**
 * The note confirm with its alternatives (docs/dev/history/technical-design-note-setups.md
 * §4.4): the plan's text and button, plus one button for the best
 * alternative; the detail lists every place with its file. `fullDisplay`
 * as for `noteCreationConfirmText`.
 */
export function noteChoiceText(plan: NoteCreationPlan, fullDisplay: string): NoteChoiceText {
  const own = noteCreationConfirmText(plan, fullDisplay);
  const alternatives = plan.alternatives ?? [];
  if (alternatives.length === 0) return {text: own.text, detail: own.detail, labels: [own.actionLabel]};
  const places = [plan, ...alternatives].map((p, i) => `${i === 0 ? 'Default here' : 'Or'}: ${placeLine(p)}`).join(' · ');
  return {
    text: own.text,
    detail: `${own.detail} ${places}. More than one setup matches; the button "${alternativeLabel(alternatives[0])}" picks the next one.`,
    labels: [own.actionLabel, alternativeLabel(alternatives[0])],
  };
}

/**
 * A home notebook's new year (docs/dev/history/technical-design-home-notebooks.md
 * §3.3): this year's file is missing, an earlier year's is there. `createName`
 * is this year's notebook (no ".note"), `createDisplay` its full display path.
 */
export function homeNotebookYearChoiceText(args: {createName: string; createDisplay: string; createYear: number; openYear: number; openName: string}): NoteChoiceText {
  return {
    text: `No ${args.createName} yet.`,
    detail: `Create ${args.createYear} creates ${args.createDisplay}. Open ${args.openYear} opens ${args.openName}.note.`,
    labels: [`Create ${args.createYear}`, `Open ${args.openYear}`],
  };
}

/** After a home notebook was created: the file and its folder. */
export function homeNotebookCreatedText(fileName: string, folderDisplay: string): string {
  return `Created ${fileName}.note in ${folderDisplay}.`;
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

// ---- Tag Rules -> Note setups notice (docs/dev/history/technical-design-note-setups.md §5, §6.6) ----

function itemsOf(context: string): string {
  return context === 'todo' ? 'todos' : 'meetings';
}

function pageNameOf(kind: string): string {
  return kind === 'first' ? 'First page' : kind === 'todo' ? 'Todo page' : 'Meeting page';
}

/** A component of several rules became one setup. */
export function migrationMergedText(ruleNames: readonly string[]): string {
  return `Merged from the rules ${ruleNames.join(', ')}.`;
}

/** Two rules of the same context in one setup: the first one's page was kept. */
export function migrationConflictText(ruleName: string, pageKind: string): string {
  return `Rule ${ruleName} left out: the ${pageNameOf(pageKind)} comes from an earlier rule.`;
}

/** An own-note rule joined a setup with a notebook (shared means shared). */
export function migrationIntoNotebookText(context: string, tags: readonly string[], notebookName: string): string {
  return `New ${itemsOf(context)} with ${tags.map(t => `#${t}`).join(' ')} now get pages in ${notebookName}.`;
}

/** A shared rule whose notebook differs from the setup's. */
export function migrationNotebookChangedText(context: string, folder: string, notebookName: string): string {
  return `New ${itemsOf(context)} now go into ${folder ? `${folder}/` : ''}${notebookName}.`;
}

/** A shared Meeting/Todo rule on a loop kind: outside an active loop its items get their own note now. */
export function migrationLoopOwnText(context: string): string {
  return `New ${itemsOf(context)} outside an active loop now get their own note.`;
}

/** An own-note Default rule next to a shared one: items without a setup now get pages in the Default's notebook. */
export function migrationDefaultIntoNotebookText(context: string, notebookName: string): string {
  return `New ${itemsOf(context)} without a setup now get pages in ${notebookName}.`;
}

/** Project and Area rules were never applied. */
export function migrationNeverAppliedText(): string {
  return 'Removed: Project and Area rules never had an effect.';
}

/** A second or switched-off Default rule. */
export function migrationDefaultRemovedText(): string {
  return 'Removed: only the first Default per kind is kept.';
}

/** A rule without tags never matched. */
export function migrationNoTagsText(): string {
  return 'Removed: a rule without tags never matched.';
}

/** A switched-off rule whose tags are in a switched-on setup. */
export function migrationOffCollisionText(): string {
  return 'Removed: switched off, and its tags are in a setup that is on.';
}

/** Loop-kind tags taken out of a Meeting/Todo rule (a tag belongs to one setup). */
export function migrationLoopKindTagText(tags: readonly string[]): string {
  return `${tags.map(t => `#${t}`).join(' ')} left out: a loop kind belongs to its Loop setup.`;
}
