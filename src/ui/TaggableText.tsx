/**
 * The `#tags` in a row's title as tap targets - one helper for ui/TaskRow.tsx
 * and ui/MeetingRow.tsx (docs/dev/history/technical-design-tending-threads.md §3.7).
 *
 * `text` is split with domain/markdown.ts's `splitTextWithTags` (callers pass
 * what the row displays, e.g. `displayTaskText`'s output, never the raw text).
 * A context tag becomes its own nested `<Text onPress>` only when the screen
 * passes `onToggleContext` (Daily's filter); it is drawn filled when it is the
 * active `contextTag`. Reserved words (flow state, `#now`, due) stay plain
 * text. A nested tag's `onPress` wins over the row's own tap: React Native
 * gives a touch to the innermost element with its own `onPress`.
 *
 * A plain function returning text nodes, not a component, so the segments
 * sit directly inside the row's title `<Text>` and wrap and clamp with it.
 */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {isContextTag} from '../domain/flowState';
import {splitTextWithTags} from '../domain/markdown';
import {COLORS} from './theme';

export interface TaggableTextOptions {
  /** The active Daily filter tag; a matching tag is drawn selected. */
  contextTag?: string | null;
  /** Daily's filter toggle; without it tags render as plain text. */
  onToggleContext?: (tag: string) => void;
}

/** `text` as plain runs and tappable tag spans - see the module doc comment. */
export function renderTaggableText(text: string, {contextTag, onToggleContext}: TaggableTextOptions): React.ReactNode {
  if (!onToggleContext) return text;
  return splitTextWithTags(text).map((segment, index) => {
    if (segment.kind === 'text') return segment.value;
    if (!isContextTag(segment.value)) return `#${segment.value}`;
    const selected = segment.value === contextTag;
    return (
      <Text
        key={`tag-${index}`}
        onPress={() => onToggleContext(segment.value)}
        style={selected ? styles.tagSelected : styles.tag}>
        {`#${segment.value}`}
      </Text>
    );
  });
}

const styles = StyleSheet.create({
  tag: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  tagSelected: {
    color: COLORS.accentText,
    fontWeight: '600',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 3,
  },
});
