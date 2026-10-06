/**
 * What tapping a Todo/Meeting's note icon is about to do, decided before
 * anything is written (docs/dev/history/technical-design-split-by-tag.md §3.5).
 *
 * `storage/meetingNoteContent.ts` plans first (reads only), then - for every
 * kind except an ordinary open - asks the screen to confirm in the status
 * slot (`ui/useNoteCreateConfirm.ts`, texts in `domain/fileChangeText.ts`),
 * and only then creates, recreates or links. Pure type, no logic.
 */

export type NoteCreationPlanKind =
  /** First-time note in its own file (no rule, an own-target rule, or an Inbox item). */
  | 'new-own-file'
  /** First-time note as a new page in a shared file that already exists. */
  | 'new-page'
  /** First-time note as the first page of a shared file that doesn't exist yet. */
  | 'new-shared-file'
  /** First-time note, but the shared file already has a page with this item's keyword - link to it. */
  | 'link-page'
  /** The item's shared file is there, but its page (keyword) is not - add a fresh page. */
  | 'recreate-page'
  /** The item's shared file itself is missing - create it again with a fresh page. */
  | 'recreate-shared-file'
  /** The item's own note file is missing - create it again under the same name. */
  | 'recreate-own-file';

export interface NoteCreationPlan {
  kind: NoteCreationPlanKind;
  /** The file, relative to the item's Project/Area folder - e.g. "Meetings/Coaching sabina 2026.note". */
  file: string;
  /** The same file as an absolute path (for the detail text's full location). */
  absolutePath: string;
  /** The Tag Rule that decided this, if any - shown as "Rule <name>: ..." for first-time notes. */
  ruleName: string | null;
  /** `link-page` only: the keyword of the existing page. */
  keyword?: string;
}
