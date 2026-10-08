/**
 * The trailing `[key:: value]` fields of a task line
 * (docs/dev/history/technical-design-tending-threads.md §3.1.1): Dataview
 * inline fields, the format Obsidian's Tasks plugin reads when its "Task
 * Format" is Dataview. You type tags; gtdpara writes fields.
 *
 *   - [x] text #tags → [[note]] +[[file]] [meeting:: …] [created:: …] [due:: …] [completion:: …]
 *
 * Only fields at the very end of a line count; a field in the middle of the
 * text is text (as in Tasks). Parsing strips them right to left before the
 * links; writing appends them after the links, known keys in a fixed order
 * (`meeting`, `created`, `due`, `completion`), then unknown fields verbatim.
 * Pure.
 */
import {TaskFields} from './types';

type KnownKey = 'meeting' | 'created' | 'due' | 'completion';

/** Written in this order, before any unknown field. */
export const TASK_FIELD_ORDER: readonly KnownKey[] = ['meeting', 'created', 'due', 'completion'];

const TRAILING_FIELD_RE = /\s*\[([a-z][\w-]*)::[ \t]*([^\]]*)\]\s*$/;

export function emptyTaskFields(): TaskFields {
  return {due: null, created: null, completion: null, meeting: null, extra: []};
}

function isKnownKey(key: string): key is KnownKey {
  return (TASK_FIELD_ORDER as readonly string[]).includes(key);
}

/**
 * Splits the trailing fields off `raw`. The first occurrence of a known key
 * (in file order) wins; a repeated known key, a known key without a value
 * and every unknown key are kept verbatim in `extra`, so nothing is lost and
 * a second parse of the written line gives the same result.
 */
export function splitTrailingFields(raw: string): {text: string; fields: TaskFields} {
  const tokens: Array<{key: string; value: string; token: string}> = [];
  let rest = raw;
  for (let match = TRAILING_FIELD_RE.exec(rest); match; match = TRAILING_FIELD_RE.exec(rest)) {
    tokens.unshift({key: match[1], value: match[2].trim(), token: match[0].trim()});
    rest = rest.slice(0, match.index);
  }
  const fields = emptyTaskFields();
  for (const {key, value, token} of tokens) {
    if (isKnownKey(key) && fields[key] === null && value.length > 0) fields[key] = value;
    else fields.extra.push(token);
  }
  return {text: tokens.length > 0 ? rest : raw, fields};
}

/** The field tokens of `fields` in write order, space-separated ('' when there are none). */
export function serializeTaskFields(fields: TaskFields): string {
  const tokens: string[] = [];
  for (const key of TASK_FIELD_ORDER) {
    const value = fields[key];
    if (value) tokens.push(`[${key}:: ${value}]`);
  }
  tokens.push(...fields.extra);
  return tokens.join(' ');
}

/** `text` with `fields` appended (unchanged when there are none). */
export function appendTaskFields(text: string, fields: TaskFields): string {
  const tokens = serializeTaskFields(fields);
  if (!tokens) return text;
  return text ? `${text} ${tokens}` : tokens;
}
