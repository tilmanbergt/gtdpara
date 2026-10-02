/**
 * Pure selection-splicing helpers behind the custom Select All/Copy/Cut/
 * Paste overlay ui/QuickAddWidget.tsx's task-text/meeting-title fields got
 * on 2026-09-11 - added because Android's native text-selection toolbar
 * (the floating Cut/Copy/Paste/Select-all bar, plus draggable handles)
 * doesn't reliably appear at all inside Supernote's plugin-host window,
 * most likely because that window isn't a plain Activity the OS's
 * `ActionMode` machinery expects. These buttons work entirely off the
 * field's last-known selection (tracked in a `useRef`, never React state -
 * see the `Selection` doc comment below for why) and `@react-native-
 * clipboard/clipboard`.
 *
 * Extracted here (2026-09-11, same day as the original bugfix) so
 * ui/ClipboardTextInput.tsx - a reusable version of the same field, for any
 * *new* plain text input that wants the same copy/paste affordance (e.g.
 * ItemsList.tsx's Create Project/Area name field) - can share this logic
 * instead of re-deriving it. ui/QuickAddWidget.tsx now imports these same
 * functions rather than keeping its own copies.
 */

/**
 * A `TextInput`'s last known cursor/selection position, or `null` until the
 * field has reported a selection at least once. Tracked in a `useRef`
 * (never React state) by every caller of these helpers - `onSelectionChange`
 * fires on essentially every cursor/selection movement, and a setState-
 * driven re-render on every one of those is what broke native text
 * selection (drag handles, the copy/cut/paste/select-all action bar) on
 * Android in the first place (2026-09-11 bugfix). A ref updates for free
 * with no re-render, which is all this needs since it's only ever read
 * imperatively, never rendered.
 */
export type Selection = {start: number; end: number} | null;

/**
 * Splices `insert` into `text` at `selection`'s range - a real (non-
 * collapsed) selection is replaced; a collapsed cursor (or `null`, meaning
 * "never reported a selection") inserts at that point, falling back to the
 * end of `text`. Used for Paste (`insert` = clipboard text) and for Cut on
 * an actual selection (`insert` = '').
 */
export function spliceAtSelection(text: string, selection: Selection, insert: string): {text: string; cursor: number} {
  const clamp = (n: number) => Math.max(0, Math.min(n, text.length));
  if (selection && selection.start !== selection.end) {
    const lo = clamp(Math.min(selection.start, selection.end));
    const hi = clamp(Math.max(selection.start, selection.end));
    return {text: text.slice(0, lo) + insert + text.slice(hi), cursor: lo + insert.length};
  }
  const pos = selection ? clamp(selection.start) : text.length;
  return {text: text.slice(0, pos) + insert + text.slice(pos), cursor: pos + insert.length};
}

/**
 * The range Copy/Cut act on: the field's actual selection when it's a real
 * (non-collapsed) one, otherwise the whole field. Native drag-select is
 * unreliable on this hardware (see the module doc comment above), so most
 * Copy/Cut taps land with nothing actively selected - falling back to "the
 * whole field" matches what was actually asked for ("select everything and
 * copy/cut") without requiring drag-select to work first.
 */
export function copyCutRange(text: string, selection: Selection): {start: number; end: number} {
  if (selection && selection.start !== selection.end) {
    return {start: Math.min(selection.start, selection.end), end: Math.max(selection.start, selection.end)};
  }
  return {start: 0, end: text.length};
}

/**
 * The text of a REAL (non-collapsed) selection, or '' when there is none
 * (`null` = the field never reported a selection, or a collapsed cursor).
 * Unlike `copyCutRange` there is deliberately no "whole field" fallback -
 * for the read-only Gmail email text (ui/GmailBodyPane.tsx, 2026-09-21) an
 * action that silently took the entire email when the user had merely not
 * selected anything would be a surprising thing to create a Todo from, so
 * the caller greys its buttons out instead and offers an explicit "All".
 * Bounds are clamped, so a selection reported for a since-replaced text
 * (message switched mid-gesture) can never slice out of range.
 */
export function selectedText(text: string, selection: Selection): string {
  if (!selection || selection.start === selection.end) return '';
  const lo = Math.max(0, Math.min(Math.min(selection.start, selection.end), text.length));
  const hi = Math.max(0, Math.min(Math.max(selection.start, selection.end), text.length));
  return text.slice(lo, hi);
}

/**
 * Like `spliceAtSelection`, but for inserting a whole word (a placeholder
 * chip such as `{year}` - docs/dev/technical-design-split-by-tag.md §3.6): a
 * space is added on whichever side needs one, the same rule
 * domain/markdown.ts's `insertTagAtPosition` uses for tags, so the inserted
 * word never runs into its neighbours. A selected range is replaced; no
 * selection inserts at the end. Returns the cursor right after the
 * inserted word (and its trailing space, if one was added).
 */
export function spliceWordAtSelection(text: string, selection: Selection, word: string): {text: string; cursor: number} {
  const clamp = (n: number) => Math.max(0, Math.min(n, text.length));
  const lo = selection ? clamp(Math.min(selection.start, selection.end)) : text.length;
  const hi = selection ? clamp(Math.max(selection.start, selection.end)) : text.length;
  const before = text.slice(0, lo);
  const after = text.slice(hi);
  const leadingSpace = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trailingSpace = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  const insertion = `${leadingSpace}${word}${trailingSpace}`;
  return {text: before + insertion + after, cursor: before.length + insertion.length};
}
