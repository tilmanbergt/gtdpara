/**
 * In-app help (docs/dev/history/technical-design-in-app-help.md §3.3): an opaque
 * layer over the tab body (App.tsx renders it inside StatusFrame, so the
 * TabBar and the status slot stay visible and the tab screens stay mounted
 * underneath). Left: Overview + the groups/pages of docs/user/index.md;
 * right: the selected page, paged like "What's new".
 */
import React, {useMemo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {HELP_OVERVIEW_PAGE, stripLeadingTitle} from '../domain/helpTopics';
import {USER_DOCS} from '../generated/userDocs';
import MarkdownPager from './MarkdownBlocks';
import {COLORS, FONT, SPACING, useThemeColors} from './theme';

interface Props {
  pageId: string;
  onSelectPage: (pageId: string) => void;
  onClose: () => void;
}

const ROW_HEIGHT = 40;

export default function HelpOverlay({pageId, onSelectPage, onClose}: Props): React.JSX.Element {
  const {textColor, borderColor} = useThemeColors();
  const page = USER_DOCS.pages[pageId] ?? USER_DOCS.pages[HELP_OVERVIEW_PAGE];
  const shownId = USER_DOCS.pages[pageId] ? pageId : HELP_OVERVIEW_PAGE;
  const markdown = useMemo(() => (page ? stripLeadingTitle(page.markdown) : ''), [page]);

  const pageRow = (id: string, indent: boolean) => {
    const selected = id === shownId;
    return (
      <Pressable key={id} onPress={() => onSelectPage(id)} style={styles.row} hitSlop={2}>
        <Text
          style={[styles.pageText, indent && styles.indented, {color: textColor}, selected && styles.selected]}
          numberOfLines={1}>
          {selected ? '▸ ' : '  '}
          {USER_DOCS.pages[id]?.title ?? id}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.overlay}>
      <View style={[styles.left, {borderColor}]}>
        <View style={[styles.leftHeader, {borderColor}]}>
          <Text style={[styles.helpTitle, {color: textColor}]}>Help</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
            <Text style={[styles.closeText, {color: textColor}]}>✕ Close</Text>
          </Pressable>
        </View>
        {USER_DOCS.pages[HELP_OVERVIEW_PAGE] ? pageRow(HELP_OVERVIEW_PAGE, false) : null}
        {USER_DOCS.groups.map(group => (
          <View key={group.title}>
            <Text style={[styles.groupTitle, {color: textColor}]}>{group.title.toUpperCase()}</Text>
            {group.pageIds.map(id => pageRow(id, true))}
          </View>
        ))}
      </View>
      <View style={styles.right}>
        {page ? (
          <MarkdownPager
            markdown={markdown}
            header={page.title}
            resetKey={shownId}
            emptyHint="This page is empty."
            textColor={textColor}
            borderColor={borderColor}
          />
        ) : (
          <Text style={[styles.pageText, {color: textColor}]}>No help pages in this build.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    backgroundColor: COLORS.background,
  },
  left: {
    width: '30%',
    borderRightWidth: 1,
    paddingHorizontal: SPACING.base,
  },
  leftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    marginBottom: SPACING.xs,
  },
  helpTitle: {fontSize: FONT.medium, fontWeight: '700'},
  closeButton: {paddingHorizontal: SPACING.sm, paddingVertical: 4},
  closeText: {fontSize: FONT.medium, fontWeight: '600'},
  groupTitle: {
    fontSize: FONT.small,
    fontWeight: '700',
    opacity: 0.6,
    marginTop: SPACING.md,
    marginBottom: 2,
  },
  row: {height: ROW_HEIGHT, justifyContent: 'center'},
  pageText: {fontSize: FONT.medium},
  indented: {paddingLeft: SPACING.xs},
  selected: {fontWeight: '700'},
  right: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
  },
});
