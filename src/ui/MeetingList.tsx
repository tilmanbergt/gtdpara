/**
 * The standard paged meeting list (docs/dev/technical-design-meeting-lists.md
 * §2.5): ui/PagedSection.tsx plus the 1-line/2-line switch (two small icons
 * in PagedSection's `headerAccessory` slot, so no extra header line) and
 * optional group headers (Upcoming/Past). No pagination logic of its own -
 * every row has a fixed height (ui/MeetingRow.tsx's MEETING_ROW_HEIGHT), so
 * the page split is exact. The layout choice is remembered per list for the
 * session (ui/listLayout.ts). Switching layout keeps the row that was at the
 * top of the page in view (not back to page one) - the
 * list re-pages via PagedSection's `jumpTo` to wherever that row now falls.
 *
 * The screen keeps building the rows itself (`renderRow` gets the current
 * layout) - its action wiring (notes, tracking, arming) stays where its
 * state lives, the same split every list in this codebase follows.
 */
import React, {useMemo, useRef} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MEETING_ROW_HEIGHT, MeetingRowLayout} from './MeetingRow';
import PagedSection from './PagedSection';
import {MeetingListId, useListLayout} from './listLayout';
import {FONT} from './theme';

/** A group header inside the list ("Upcoming", "Past") - fixed height like every row. */
export interface MeetingListHeaderRow {
  kind: 'header';
  key: string;
  label: string;
}

export const MEETING_LIST_HEADER_ROW_HEIGHT = 30;

function isHeaderRow<T>(row: T | MeetingListHeaderRow): row is MeetingListHeaderRow {
  return typeof row === 'object' && row !== null && (row as MeetingListHeaderRow).kind === 'header';
}

interface Props<T> {
  listId: MeetingListId;
  defaultLayout: MeetingRowLayout;
  header: React.ReactNode;
  rows: Array<T | MeetingListHeaderRow>;
  renderRow: (row: T, layout: MeetingRowLayout) => React.ReactNode;
  resetKey?: string | number;
  emptyHint?: string;
  textColor: string;
  borderColor: string;
}

export default function MeetingList<T>({
  listId,
  defaultLayout,
  header,
  rows,
  renderRow,
  resetKey,
  emptyHint,
  textColor,
  borderColor,
}: Props<T>): React.JSX.Element {
  const [layout, setLayout] = useListLayout(listId, defaultLayout);
  // First row of the current page, tracked so a layout switch can land on
  // the page that still shows it. Keyed by layout: the jump fires exactly
  // when the layout changes (and harmlessly to index 0 on mount).
  const firstRowRef = useRef(0);
  const jumpTo = useMemo(() => ({key: layout, index: firstRowRef.current}), [layout]);
  return (
    <PagedSection
      header={header}
      headerAccessory={<LayoutSwitch layout={layout} onChange={setLayout} textColor={textColor} />}
      rows={rows}
      rowHeight={row => (isHeaderRow(row) ? MEETING_LIST_HEADER_ROW_HEIGHT : MEETING_ROW_HEIGHT[layout])}
      isCountableRow={row => !isHeaderRow(row)}
      resetKey={resetKey}
      jumpTo={jumpTo}
      onFirstRowChange={index => {
        firstRowRef.current = index;
      }}
      renderRow={row =>
        isHeaderRow(row) ? (
          <View key={row.key} style={styles.groupHeader}>
            <Text style={[styles.groupHeaderText, {color: textColor}]}>{row.label}</Text>
          </View>
        ) : (
          renderRow(row, layout)
        )
      }
      emptyHint={emptyHint}
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

/** The two 26 dp icons: four thin lines = 1-line layout, two bars = 2-line layout; the active one is filled. */
export function LayoutSwitch({
  layout,
  onChange,
  textColor,
}: {
  layout: MeetingRowLayout;
  onChange: (layout: MeetingRowLayout) => void;
  textColor: string;
}): React.JSX.Element {
  const icon = (kind: MeetingRowLayout) => {
    const active = layout === kind;
    const fg = active ? '#ffffff' : textColor;
    const bars = kind === 'oneLine' ? [0, 1, 2, 3] : [0, 1];
    return (
      <Pressable
        key={kind}
        onPress={() => onChange(kind)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{selected: active}}
        accessibilityLabel={kind === 'oneLine' ? 'One-line rows' : 'Two-line rows'}
        style={[styles.icon, {borderColor: textColor}, active && {backgroundColor: textColor}]}>
        {bars.map(i => (
          <View key={i} style={[kind === 'oneLine' ? styles.thinBar : styles.thickBar, {backgroundColor: fg}]} />
        ))}
      </Pressable>
    );
  };
  return (
    <View style={styles.switch}>
      {icon('oneLine')}
      {icon('twoLine')}
    </View>
  );
}

const styles = StyleSheet.create({
  groupHeader: {
    height: MEETING_LIST_HEADER_ROW_HEIGHT,
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  groupHeaderText: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.6,
  },
  switch: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  icon: {
    width: 26,
    height: 26,
    borderWidth: 1.5,
    borderRadius: 4,
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  thinBar: {height: 2, marginVertical: 1.5},
  thickBar: {height: 5, marginVertical: 2},
});
