/**
 * The context-tag suggestion/insert chips (technical-design-context-tags.md
 * §8) of Quick Add, next to (or, past page 0, in place of)
 * ui/FlowStateChips.tsx. Visually the same chip primitive FlowStateChips
 * established (border -> COLORS.accent + white text when selected,
 * FONT.small, radius 6).
 *
 * Tags already present in the current draft/edit text are pinned at the
 * front, shown selected (tapping one removes it); then up to 30 recently
 * used tags, paged since there's nowhere near enough width for all of them.
 *
 * Two layouts:
 * - `TagChips`: one row (R3) with "‹"/"›" around the page - used while R4
 *   holds something else (the provenance line, the edit form's commands).
 * - `useTwoRowTagChips`: one page spread over R3 and R4
 *   (docs/dev/history/technical-design-item-card.md §5), both arrows at the
 *   end of R4.
 *
 * `page`/`onPageChange` are controlled by the caller rather than owned here,
 * because for Todo the page number *also* decides whether FlowStateChips
 * shows at all - page 0 keeps the flow chips and a narrow tag capacity,
 * page 1+ drops them for a wide one. The caller resets it to 0 whenever the
 * create/edit target changes.
 *
 * Widths (see ui/tagChipLayout.ts) are measured by the caller; pages are
 * packed by estimated chip width, pinned tags included, and labels over 8
 * characters are shortened with "…", so long/pinned tags can't overflow the
 * box.
 */
import React, {useEffect} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {extractContextTags} from '../domain/markdown';
import {estimateChipWidth, paginateByWidth, paginateTwoRows, tagChipLabel, TwoRowWidths} from './tagChipLayout';
import {COLORS, FONT} from './theme';
import {requestEinkRefresh} from '../utils/screenRefresh';

interface Common {
  /** Current draft/edit text, to find tags already present so they can be pinned first. */
  text: string;
  /** From storage/tagUsage.ts's getRecentTags, most-recent-first. */
  recentTags: string[];
  /**
   * Lowercased abbreviations of every Active-or-On-Hold Project/Area - such
   * a chip renders uppercase (`#ATR`), so a recognized Project/Area tag is
   * visible as such. Display-only: the tag string passed to
   * `onInsertTag`/`onRemoveTag`, and the value matched against `text`, are
   * untouched.
   */
  recognizedTags: Set<string>;
  page: number;
  onPageChange: (page: number) => void;
  onInsertTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  textColor: string;
  borderColor: string;
}

interface Props extends Common {
  /** Pixel width available to the chips on page 0 (row width minus flow chips / time field). */
  page0Width: number;
  /** Pixel width available on page 1 and beyond. */
  laterWidth: number;
}

interface Chip {
  tag: string;
  selected: boolean;
  label: string;
}

function tagItems(text: string, recentTags: string[], recognizedTags: Set<string>): Chip[] {
  const pinned = extractContextTags(text);
  const pinnedSet = new Set(pinned);
  return [
    ...pinned.map(tag => ({tag, selected: true})),
    ...recentTags.filter(tag => !pinnedSet.has(tag)).map(tag => ({tag, selected: false})),
  ].map(item => ({...item, label: tagChipLabel(item.tag, recognizedTags.has(item.tag))}));
}

/**
 * Pulls the caller's page back when the tag set or the width budget changed
 * under it (a tag removed, the row got narrower): for Todo that page number
 * also decides whether the flow chips show - an out-of-range page would hide
 * them with no "‹" left to get back.
 */
function useClampedPage(page: number, pageCount: number, onPageChange: (page: number) => void): number {
  const current = Math.min(Math.max(0, page), Math.max(0, pageCount - 1));
  useEffect(() => {
    if (page !== current) {
      onPageChange(current);
      requestEinkRefresh();
    }
  }, [page, current, onPageChange]);
  return current;
}

function Arrow({label, onPress, textColor}: {label: '‹' | '›'; onPress: () => void; textColor: string}) {
  return (
    <Pressable style={styles.arrow} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label === '‹' ? 'Previous tags' : 'More tags'}>
      <Text style={[styles.arrowText, {color: textColor}]}>{label}</Text>
    </Pressable>
  );
}

function Chips({chips, common}: {chips: Chip[]; common: Common}) {
  const {onInsertTag, onRemoveTag, textColor, borderColor} = common;
  return (
    <>
      {chips.map(({tag, selected, label}) => (
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
    </>
  );
}

/** One row: "‹" chips "›". */
export default function TagChips(props: Props): React.JSX.Element | null {
  const items = tagItems(props.text, props.recentTags, props.recognizedTags);
  const pages = paginateByWidth(items, item => estimateChipWidth(item.label), props.page0Width, props.laterWidth);
  const current = useClampedPage(props.page, pages.length, props.onPageChange);
  if (items.length === 0) return null;
  const last = Math.max(0, pages.length - 1);
  return (
    <View style={styles.row}>
      {current > 0 && <Arrow label="‹" onPress={() => props.onPageChange(current - 1)} textColor={props.textColor} />}
      <Chips chips={pages[current] ?? []} common={props} />
      {current < last && <Arrow label="›" onPress={() => props.onPageChange(current + 1)} textColor={props.textColor} />}
    </View>
  );
}

/**
 * One page over two rows: the R3 part (null when it holds no chips) and the
 * R4 part with "‹ ›" at its end (null when it holds nothing). Whether the
 * page is past 0 is the caller's `page` - it decides about the flow chips.
 */
export function useTwoRowTagChips(props: Common & {widths: TwoRowWidths}): {row3: React.ReactNode; row4: React.ReactNode} {
  const items = tagItems(props.text, props.recentTags, props.recognizedTags);
  const pages = paginateTwoRows(items, item => estimateChipWidth(item.label), props.widths);
  const current = useClampedPage(props.page, pages.length, props.onPageChange);
  const page = pages[current] ?? {row3: [], row4: []};
  const hasPrev = current > 0;
  const hasNext = current < pages.length - 1;
  return {
    row3: page.row3.length > 0 ? (
      <View style={styles.row}>
        <Chips chips={page.row3} common={props} />
      </View>
    ) : null,
    row4:
      page.row4.length > 0 || hasPrev || hasNext ? (
        <View style={styles.row}>
          <Chips chips={page.row4} common={props} />
          {hasPrev && <Arrow label="‹" onPress={() => props.onPageChange(current - 1)} textColor={props.textColor} />}
          {hasNext && <Arrow label="›" onPress={() => props.onPageChange(current + 1)} textColor={props.textColor} />}
        </View>
      ) : null,
  };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    flexShrink: 1,
    // Safety net: if a width estimate ever runs short, the last chip is cut
    // at this edge instead of painting past the box.
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
