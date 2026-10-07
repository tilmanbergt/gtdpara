/**
 * Builds a todo's saved line from Quick Add's fields - flow-state tag
 * (with the waiting-on name), a trailing `[due:: …]` field, and the
 * abbreviation tag that picked the destination removed again. Shared by
 * Quick Add's create and edit and by the lasso capture panel, which saves
 * several items with the same chips (docs/dev/history/technical-design-lasso-0.8.md
 * §3.9). The result is one string: text plus trailing fields, which
 * storage/itemMutations.ts's `buildTask`/`applyTaskEdit` split again
 * (domain/taskEdit.ts's `parseTaskInput`). Pure.
 */
import {setFlowStateTag, slugifyWaitingOn} from './flowState';
import {removeTagFromText, setDueInLine} from './markdown';
import {FlowState} from './types';

export interface TaskComposeFields {
  text: string;
  flowState: FlowState;
  waitingOnText: string;
  dueDate: string;
}

/**
 * The text as it is saved. `abbrevTag` (without '#') is removed when the
 * item is filed by that abbreviation. Returns '' for empty text.
 */
export function composeTaskText(fields: TaskComposeFields, abbrevTag: string | null = null): string {
  const trimmed = fields.text.trim();
  if (!trimmed) {return '';}
  let finalText = setFlowStateTag(
    trimmed,
    fields.flowState,
    fields.flowState === 'waiting-for' ? slugifyWaitingOn(fields.waitingOnText) : undefined,
  );
  if (abbrevTag) {finalText = removeTagFromText(finalText, abbrevTag);}
  return setDueInLine(finalText, fields.dueDate.trim() || null);
}
