/**
 * A tag a screen presets on the todos it adds from Quick Add
 * (docs/dev/history/technical-design-engage-in-context.md §2.11, E13): the
 * thread overview's thread tag, or the counterpart's leaf in the counterpart
 * lens. The same shape as useProvenance: `part` is its piece of Quick Add's
 * grey line, whose ✕ drops the tag for the next todo only; `apply` adds it
 * (domain/loopEdit.ts's `withOwnerTag`, never twice); `added` turns it on
 * again after a todo was added.
 */
import {useState} from 'react';
import {withOwnerTag} from '../../domain/loopEdit';
import {QuickAddPart} from './ProvenanceLine';

export interface PresetTagState {
  part: QuickAddPart | null;
  apply: (composedLine: string) => string;
  added: () => void;
}

export function usePresetTag(tag: string | null): PresetTagState {
  const [droppedTag, setDroppedTag] = useState<string | null>(null);
  const active = tag !== null && tag !== droppedTag;
  return {
    part: active && tag ? {key: 'presetTag', label: `#${tag}`, onClear: () => setDroppedTag(tag)} : null,
    apply: line => (active && tag ? withOwnerTag(line, tag) : line),
    added: () => setDroppedTag(null),
  };
}
