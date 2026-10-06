/**
 * A small generic segmented switcher (docs/dev/technical-design-google-
 * calendar.md §8) - one shared primitive used two ways, uniform across the
 * app: 2-way (existing view | Google Calendar) in
 * every calendar-showing area (DailyView/ProjectDataPanel/InboxScreen/
 * ReviewScreen's Week-ahead step), and 3-way (Folders | Focus | Calendar) in
 * Settings.tsx. Deliberately just a row of labels with an active underline
 * - no icons, no counts - so it reads the same in every context it's used.
 *
 * `disabled` (used by ui/FileBrowserPane.tsx's Browse tab): a tab can be
 * greyed out and non-tappable without disappearing from the row - tabs are
 * not added or removed, only what tapping them does changes. Omitted
 * (undefined) means "enabled".
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {COLORS, FONT} from './theme';

export interface MiniTabDef<K extends string> {
  key: K;
  label: string;
  disabled?: boolean;
}

interface Props<K extends string> {
  tabs: MiniTabDef<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  /** Optional element right-aligned in the same strip (e.g. ui/DayMeetingsPanel.tsx's "Close" button). */
  trailing?: React.ReactNode;
  textColor: string;
  borderColor: string;
}

export default function MiniTabs<K extends string>({
  tabs,
  activeKey,
  onChange,
  trailing,
  textColor,
  borderColor,
}: Props<K>): React.JSX.Element {
  return (
    <View style={[styles.row, {borderColor}]}>
      {tabs.map(tab => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => !tab.disabled && onChange(tab.key)}
            disabled={tab.disabled}>
            <Text
              style={[
                styles.text,
                {color: textColor},
                active && styles.textActive,
                tab.disabled && styles.textDisabled,
              ]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
      {trailing != null && <View style={styles.trailing}>{trailing}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  trailing: {
    marginLeft: 'auto',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.accent,
  },
  text: {
    fontSize: FONT.medium,
  },
  textActive: {
    fontWeight: '600',
  },
  textDisabled: {
    opacity: 0.35,
  },
});
