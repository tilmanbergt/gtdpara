/**
 * The `#tags` in a row's title as tap targets - one helper for ui/TaskRow.tsx
 * and ui/MeetingRow.tsx (docs/dev/history/technical-design-tending-threads.md §3.7).
 *
 * `text` is split with domain/markdown.ts's `splitTextWithTags` (callers pass
 * what the row displays, e.g. `displayTaskText`'s output, never the raw text).
 *
 * - A nested context tag (`#retro/alpha`) is always a tap target: it opens
 *   the thread overview (thread lens) with the row's item as owner
 *   (`ownerPath`; null when the row doesn't know it).
 * - A plain context tag is a tap target only when the screen passes
 *   `onToggleContext` (Daily's filter); it is drawn filled when it is the
 *   active `contextTag`.
 * - Reserved words (flow state, `#wf/…`, `#now`, due) stay plain text.
 *
 * A tag's `onPress` wins over the row's own tap: React Native gives a touch
 * to the innermost element with its own `onPress`.
 *
 * A plain function returning text nodes, not a component, so the segments
 * sit directly inside the row's title `<Text>` and wrap and clamp with it.
 */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {isContextTag} from '../domain/flowState';
import {splitTextWithTags} from '../domain/markdown';
import {threadOf} from '../domain/threads';
import {openThreadOverview} from './threadOverlayStore';
import {COLORS} from './theme';

export interface TaggableTextOptions {
  /** The active Daily filter tag; a matching tag is drawn selected. */
  contextTag?: string | null;
  /** Daily's filter toggle; without it tags render as plain text. */
  onToggleContext?: (tag: string) => void;
  /** The row's item (the Inbox folder for Inbox rows) - the overview's owner. */
  ownerPath?: string | null;
}

/** `text` as plain runs and tappable tag spans - see the module doc comment. */
export function renderTaggableText(text: string, {contextTag, onToggleContext, ownerPath}: TaggableTextOptions): React.ReactNode {
  const segments = splitTextWithTags(text);
  const nested = (tag: string) => isContextTag(tag) && threadOf(tag) !== null;
  if (!onToggleContext && !segments.some(s => s.kind === 'tag' && nested(s.value))) return text;
  return segments.map((segment, index) => {
    if (segment.kind === 'text') return segment.value;
    if (nested(segment.value)) {
      return (
        <Text
          key={`tag-${index}`}
          onPress={() => openThreadOverview({tag: segment.value, ownerPath: ownerPath ?? null})}
          style={styles.tag}>
          {segment.raw}
        </Text>
      );
    }
    if (!onToggleContext || !isContextTag(segment.value)) return segment.raw;
    const selected = segment.value === contextTag;
    return (
      <Text
        key={`tag-${index}`}
        onPress={() => onToggleContext(segment.value)}
        style={selected ? styles.tagSelected : styles.tag}>
        {segment.raw}
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
