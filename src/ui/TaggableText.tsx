/**
 * The `#tags` in a row's title as tap targets - one helper for ui/TaskRow.tsx
 * and ui/MeetingRow.tsx (docs/dev/history/technical-design-tending-threads.md §3.7).
 *
 * `text` is split with domain/markdown.ts's `splitTextWithTags` (callers pass
 * what the row displays, e.g. `displayTaskText`'s output, never the raw text).
 *
 * - A nested context tag (`#retro/alpha`) is always a tap target: it opens
 *   the thread overview (thread lens) with the row's item as owner
 *   (`ownerPath`; null when the row doesn't know it). `#owe/<name>` opens
 *   the counterpart lens for `<name>` instead (ui/overviewStore.ts).
 * - A plain context tag is a tap target only when the screen passes
 *   `onToggleContext` (Daily's filter); it is drawn filled when it is the
 *   active `contextTag`.
 * - Reserved words (flow state, `#wf/…`, `#now`, due) stay plain text; the
 *   `#w/f Name` label (ui/TaskLabels.tsx) is the tap target for `#wf/<name>`.
 *
 * A tag's `onPress` wins over the row's own tap: React Native gives a touch
 * to the innermost element with its own `onPress`.
 *
 * In the touch test (ui/touchDiag/touchProbe.ts) `probe` is set: every
 * tappable tag reports its press events as part `tag:<n>` (the n-th tag in
 * `text`, from 1) and a press instead of opening an overview or toggling
 * the filter, and the tag the last touch hit is drawn filled.
 *
 * A plain function returning text nodes, not a component, so the segments
 * sit directly inside the row's title `<Text>` and wrap and clamp with it.
 */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {isContextTag} from '../domain/flowState';
import {splitTextWithTags} from '../domain/markdown';
import {threadOf} from '../domain/threads';
import {log} from '../utils/log';
import {openOverview} from './overviewStore';
import {COLORS} from './theme';
import {HIT_SPAN_STYLE, isHit, probeSpan, TouchProbe} from './touchDiag/touchProbe';

export interface TaggableTextOptions {
  /** The active Daily filter tag; a matching tag is drawn selected. */
  contextTag?: string | null;
  /** Daily's filter toggle; without it tags render as plain text. */
  onToggleContext?: (tag: string) => void;
  /** The row's item (the Inbox folder for Inbox rows) - the overview's owner. */
  ownerPath?: string | null;
  /** The touch test's probe; null or absent everywhere else. */
  probe?: TouchProbe | null;
}

/** `text` as plain runs and tappable tag spans - see the module doc comment. */
export function renderTaggableText(text: string, {contextTag, onToggleContext, ownerPath, probe = null}: TaggableTextOptions): React.ReactNode {
  const segments = splitTextWithTags(text);
  const nested = (tag: string) => isContextTag(tag) && threadOf(tag) !== null;
  if (!onToggleContext && !segments.some(s => s.kind === 'tag' && nested(s.value))) return text;
  let tagNumber = 0;
  return segments.map((segment, index) => {
    if (segment.kind === 'text') return segment.value;
    tagNumber += 1;
    const part = `tag:${tagNumber}`;
    const hit = isHit(probe, part) && HIT_SPAN_STYLE;
    if (nested(segment.value)) {
      return (
        <Text
          key={`tag-${index}`}
          onPress={
            probe
              ? () => probe.report('press', part)
              : () => {
                  // No tag in the log: tags can hold client names.
                  log('TaggableText: thread tag tapped');
                  openOverview({tag: segment.value, ownerPath: ownerPath ?? null});
                }
          }
          style={[styles.tag, hit]}
          {...probeSpan(probe, part)}>
          {segment.raw}
        </Text>
      );
    }
    if (!onToggleContext || !isContextTag(segment.value)) return segment.raw;
    const selected = segment.value === contextTag;
    return (
      <Text
        key={`tag-${index}`}
        onPress={probe ? () => probe.report('press', part) : () => onToggleContext(segment.value)}
        style={[selected ? styles.tagSelected : styles.tag, hit]}
        {...probeSpan(probe, part)}>
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
