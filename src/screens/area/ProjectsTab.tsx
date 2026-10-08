/**
 * The Projects tab of an Area page's Files area
 * (docs/dev/history/technical-design-projects-findable-notes.md §1): the
 * Projects assigned to this Area, Active first, then a folded "n on hold"
 * row. Each row has two lines, like an Active row on the Threads tab: the
 * name, then the last and next meeting and the open / next / Waiting For
 * counts (storage/projectGlance.ts). Tapping a row opens the Project.
 *
 * Linking a file switches this tab's slot to the Projects' folders
 * (ui/FileBrowserPane.tsx's `armingRoot`); outside arming no project folders
 * are browsed from here.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {todayIso} from '../../domain/meetingTime';
import {buildProjectGlance, glanceCountsText, glanceMeetingText, ProjectGlanceRow} from '../../storage/projectGlance';
import PagedSection from '../../ui/PagedSection';
import {FONT, SPACING} from '../../ui/theme';
import {useCachedItems} from '../../ui/useCachedItems';
import {FolderEntry} from '../../supernote/fileSystem';

const PROJECT_HEIGHT = 57;
const FOLD_HEIGHT = 37;

type Row = {kind: 'project'; key: string; glance: ProjectGlanceRow} | {kind: 'fold'; key: string; count: number};

interface Props {
  /** The Area's name (what a Project's `area:` holds). */
  areaName: string;
  onOpenItem?: (kind: 'project' | 'area', entry: FolderEntry) => void;
  viewportHeight?: number;
  textColor: string;
  borderColor: string;
}

export default function ProjectsTab({areaName, onOpenItem, viewportHeight, textColor, borderColor}: Props): React.JSX.Element {
  const items = useCachedItems();
  const [showOnHold, setShowOnHold] = useState(false);
  const today = todayIso();
  const glance = useMemo(() => buildProjectGlance(areaName, items, today, new Date()), [areaName, items, today]);

  const active = glance.filter(g => g.status === 'active');
  const onHold = glance.filter(g => g.status === 'on-hold');
  const rows: Row[] = active.map(g => ({kind: 'project', key: g.item.path, glance: g}));
  if (onHold.length > 0) {
    rows.push({kind: 'fold', key: 'fold', count: onHold.length});
    if (showOnHold) onHold.forEach(g => rows.push({kind: 'project', key: g.item.path, glance: g}));
  }

  const renderRow = (row: Row): React.ReactNode => {
    if (row.kind === 'fold') {
      return (
        <Pressable key={row.key} onPress={() => setShowOnHold(v => !v)} style={[styles.row, styles.line, {height: FOLD_HEIGHT, borderColor}]}>
          <Text style={[styles.small, {color: textColor}]}>
            {row.count} on hold {showOnHold ? '▾' : '▸'}
          </Text>
        </Pressable>
      );
    }
    const {item} = row.glance;
    return (
      <Pressable
        key={row.key}
        onPress={() => onOpenItem?.('project', {name: item.name, path: item.path, isFolder: true})}
        style={[styles.row, {height: PROJECT_HEIGHT, borderColor}]}>
        <View style={styles.line}>
          <Text style={[styles.name, {color: textColor}]} numberOfLines={1}>
            {item.name}
          </Text>
          {row.glance.status === 'on-hold' && <Text style={[styles.small, styles.onHold, {color: textColor}]}>on hold</Text>}
          <View style={styles.spacer} />
          <Text style={[styles.open, {color: textColor}]}>›</Text>
        </View>
        <View style={[styles.line, styles.second]}>
          <Text style={[styles.small, styles.dim, styles.shrink, {color: textColor}]} numberOfLines={1}>
            {glanceMeetingText(row.glance, today)}
          </Text>
          <View style={styles.spacer} />
          <Text style={[styles.small, styles.dim, {color: textColor}]} numberOfLines={1}>
            {glanceCountsText(row.glance)}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={viewportHeight === undefined ? styles.fill : undefined}>
      <PagedSection
        header="Projects"
        rows={rows}
        rowHeight={row => (row.kind === 'project' ? PROJECT_HEIGHT : FOLD_HEIGHT)}
        isCountableRow={row => row.kind === 'project'}
        viewportHeight={viewportHeight}
        resetKey={areaName}
        renderRow={renderRow}
        emptyHint="No Projects in this Area yet."
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  row: {borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center'},
  line: {flexDirection: 'row', alignItems: 'center'},
  name: {fontSize: FONT.medium, fontWeight: '600', flexShrink: 1},
  onHold: {opacity: 0.6, marginLeft: SPACING.sm},
  small: {fontSize: FONT.small},
  dim: {opacity: 0.7},
  shrink: {flexShrink: 1},
  second: {marginTop: 2},
  spacer: {flex: 1, minWidth: SPACING.sm},
  open: {fontSize: FONT.large, paddingHorizontal: SPACING.sm},
});
