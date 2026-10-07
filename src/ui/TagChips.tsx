/**
 * The context-tag suggestion/insert row (technical-design-context-tags.md
 * §8) - ui/QuickAddWidget.tsx's Row 3, alongside (or, past page 0, in place
 * of) ui/FlowStateChips.tsx. Visually the same chip primitive
 * FlowStateChips already established (border -> COLORS.accent + white text when
 * selected, FONT.small, radius 6), reused rather than reinvented.
 *
 * Two things FlowStateChips doesn't need to do: pin tags already present in
 * the current draft/edit text at the front, shown selected (tapping one
 * removes it - the same toggle-to-clear shape FlowStateChips' own chips
 * use); and page through up to 30 recently-used tags rather than showing a
 * fixed set, since there's nowhere near enough width for all of them at
 * once.
 *
 * `page`/`onPageChange` are controlled by the caller rather than owned here,
 * because for Todo's Row 3 the page number *also* decides whether
 * FlowStateChips shows at all - page 0 keeps the flow chips and a narrow tag
 * capacity, page 1+ drops them for a wide one (technical-design-context-
 * tags.md §8). QuickAddWidget needs to know the current page to make that
 * call, so page state lives there, reset (back to 0) whenever the
 * create/edit target changes - alongside its wasEditingRef transition
 * effect.
 *
 * `page0Width`/`laterWidth` (see ui/tagChipLayout.ts): the pixel budget for
 * page 0 and for every later page, measured by the caller. Todo's page 0 is
 * narrower (flow chips share the row); Meeting's page 0 loses the time
 * field's width; Note passes the same value for both. Pages are packed by
 * estimated chip width, pinned tags included, and labels over 8 characters
 * are shortened with "…", so long/pinned tags can't overflow the card and
 * cover the attachment ✕.
 */
import React, {useEffect} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {extractContextTags} from '../domain/markdown';
import {estimateChipWidth, paginateByWidth, tagChipLabel} from './tagChipLayout';
import {COLORS, FONT} from './theme';
import {requestEinkRefresh} from '../utils/screenRefresh';

interface Props {
  /** Current draft/edit text, to find tags already present so they can be pinned first. */
  text: string;
  /** From storage/tagUsage.ts's getRecentTags, most-recent-first. */
  recentTags: string[];
  /**
   * Lowercased abbreviations of every Active-or-On-Hold Project/Area - a
   * chip whose tag is in this set renders uppercase (`#ATR`) instead of
   * as-typed (`#atr`), so a recognized Project/Area tag is immediately
   * visible as such in the tag list, for both pinned and suggested chips.
   * Display-only: the tag string passed to `onInsertTag`/`onRemoveTag`, and
   * the value matched against `text`, are untouched - abbreviations stay
   * case-insensitive everywhere else. Computed by the caller
   * (`ui/QuickAddWidget.tsx`, from the same cached-items read
   * `domain/abbrev.ts`'s `resolveAbbrevFileTarget` uses) rather than here,
   * so this component doesn't need its own `storage/` dependency or
   * `ItemStatus` import for what's otherwise a pure display primitive.
   */
  recognizedTags: Set<string>;
  page: number;
  onPageChange: (page: number) => void;
  /** Pixel width available to the chips on page 0 (row width minus flow chips / time field / attachment cluster). */
  page0Width: number;
  /** Pixel width available on page 1 and beyond (row width minus the attachment cluster). */
  laterWidth: number;
  onInsertTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  textColor: string;
  borderColor: string;
}

export default function TagChips({
  text,
  recentTags,
  recognizedTags,
  page,
  onPageChange,
  page0Width,
  laterWidth,
  onInsertTag,
  onRemoveTag,
  textColor,
  borderColor,
}: Props): React.JSX.Element | null {
  const pinned = extractContextTags(text);
  const pinnedSet = new Set(pinned);
  const unpinnedRecent = recentTags.filter(tag => !pinnedSet.has(tag));

  const items = [
    ...pinned.map(tag => ({tag, selected: true})),
    ...unpinnedRecent.map(tag => ({tag, selected: false})),
  ].map(item => ({...item, label: tagChipLabel(item.tag, recognizedTags.has(item.tag))}));
  const pages = paginateByWidth(items, item => estimateChipWidth(item.label), page0Width, laterWidth);
  const lastPage = Math.max(0, pages.length - 1);
  const current = Math.min(Math.max(0, page), lastPage);
  const pageChips = pages[current] ?? [];
  const hasPrev = current > 0;
  const hasNext = current < lastPage;

  // The tag set or the width budget changed under the caller's page (a tag
  // removed, edit mode's attachment cluster appearing): pull the caller's
  // page back, since for Todo that page number also decides whether the
  // flow chips show - otherwise a now-out-of-range page would hide them
  // with no "‹" left to get back.
  useEffect(() => {
    if (page !== current) {
      onPageChange(current);
      requestEinkRefresh();
    }
  }, [page, current, onPageChange]);

  if (items.length === 0) return null;

  return (
    <View style={styles.row}>
      {hasPrev && (
        <Pressable style={styles.arrow} onPress={() => onPageChange(current - 1)} hitSlop={8}>
          <Text style={[styles.arrowText, {color: textColor}]}>‹</Text>
        </Pressable>
      )}
      {pageChips.map(({tag, selected, label}) => (
        <Pressable
          key={tag}
          style={[styles.chip, {borderColor: selected ? COLORS.accent : borderColor}, selected && styles.chipSelected]}
          onPress={() => (selected ? onRemoveTag(tag) : onInsertTag(tag))}
          hitSlop={8}>
          <Text style={[styles.chipText, {color: selected ? COLORS.accentText : textColor}]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
      {hasNext && (
        <Pressable style={styles.arrow} onPress={() => onPageChange(current + 1)} hitSlop={8}>
          <Text style={[styles.arrowText, {color: textColor}]}>›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    flexShrink: 1,
    // Safety net: if a width estimate ever runs short, the last chip is cut
    // at this edge instead of painting over the attachment cluster or past
    // the card.
    overflow: 'hidden',
  },
  chip: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 4,
  },
  chipSelected: {
    backgroundColor: COLORS.accent,
  },
  chipText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  arrow: {
    flexShrink: 0,
    paddingHorizontal: 4,
    marginRight: 4,
  },
  arrowText: {
    fontSize: FONT.medium,
    fontWeight: '700',
    opacity: 0.7,
  },
});
