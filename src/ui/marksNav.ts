/**
 * Opens the marks screen from anywhere (docs/dev/history/technical-design-lasso-0.8.md
 * §3.10): App registers its handler once; the Inbox, Current, Review and
 * close-out cards call `openMarks`. A module-level hand-off instead of a
 * prop through every screen, because the cards sit deep inside kept screens
 * (ItemDetail → ProjectDataPanel) whose elements App creates once.
 */
import {MarkScope} from '../domain/marks';
import {logWarn} from '../utils/log';

export type MarksReturnTo = 'inbox' | 'current' | 'review' | 'closeOut';

type Handler = (scope: MarkScope, returnTo: MarksReturnTo) => void;

let handler: Handler | null = null;

export function setOpenMarksHandler(next: Handler | null): void {
  handler = next;
}

export function openMarks(scope: MarkScope, returnTo: MarksReturnTo): void {
  if (handler) {handler(scope, returnTo);}
  else {logWarn('marksNav: no handler registered');}
}
