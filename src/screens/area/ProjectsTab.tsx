/**
 * The Projects tab of an Area page
 * (docs/dev/history/technical-design-projects-findable-notes.md §1) and the
 * Loops tab of a Project page (docs/dev/history/technical-design-loops.md
 * §4.7).
 *
 * - On an Area: the Projects assigned to it, Active first, then a folded
 *   "n on hold" row. Each row has two lines: the name, then the last and next
 *   meeting and the open / next / Waiting For counts and its loops
 *   (storage/projectGlance.ts). Tapping a row opens the Project.
 * - Then, on both: the item's own loops, marked ○, by main date
 *   (storage/loopGlance.ts) - main date and next meeting, then the counts of
 *   the loop's own todos; a tap opens the loop overview, 📓 the loop
 *   note (creating it from the Loop rule), the clip the loop's linked file. Under them
 *   "New" (loop tags used on an active todo or a meeting without a loop
 *   yet, with Track), and folded rows for the loop ideas (Someday) and the
 *   closed loops.
 *
 * Linking a file switches an Area's tab slot to the Projects' folders
 * (ui/FileBrowserPane.tsx's `armingRoot`); outside arming no project folders
 * are browsed from here.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {formatDate} from '../../domain/dateFormat';
import {todayIso} from '../../domain/meetingTime';
import {LoopRef} from '../../domain/loops';
import {getCachedData} from '../../storage/dataCache';
import {openLinkedFile} from '../../storage/linkedFiles';
import {buildLoopGlance, LoopGlanceRow, loopDateText} from '../../storage/loopGlance';
import {trackLoop} from '../../storage/loops';
import {buildProjectGlance, glanceCountsText, glanceMeetingText, ProjectGlanceRow} from '../../storage/projectGlance';
import {ClipIcon} from '../../ui/icons';
import PagedSection from '../../ui/PagedSection';
import {useErrorStatus} from '../../ui/status/StatusProvider';
import {FONT, SPACING} from '../../ui/theme';
import TwoLineRow, {TWO_LINE_ROW_HEIGHT} from '../../ui/TwoLineRow';
import {useCachedItems} from '../../ui/useCachedItems';
import {useLoopKinds} from '../../ui/useLoopKinds';
import {useLoopNote} from '../../ui/useLoopNote';
import {openOverview} from '../../ui/overviewStore';
import {FolderEntry} from '../../supernote/fileSystem';
import {errorMessage} from '../../utils/errorMessage';
import {logError} from '../../utils/log';

const ONE_LINE_HEIGHT = 37;
const HEAD_HEIGHT = 30;

type Fold = 'onHold' | 'ideas' | 'closed';

type Row =
  | {kind: 'project'; key: string; glance: ProjectGlanceRow}
  | {kind: 'head'; key: string; label: string}
  | {kind: 'loop'; key: string; glance: LoopGlanceRow; closed: boolean}
  | {kind: 'new'; key: string; loop: LoopRef}
  | {kind: 'idea'; key: string; loop: LoopRef}
  | {kind: 'fold'; key: string; fold: Fold; count: number; label: string};

interface Props {
  /** The Area's or Project's own kind: an Area lists its Projects first. */
  ownerKind: 'project' | 'area';
  ownerPath: string;
  /** The Area's name (what a Project's `area:` holds); unused for a Project. */
  areaName: string;
  onOpenItem?: (kind: 'project' | 'area', entry: FolderEntry) => void;
  viewportHeight?: number;
  textColor: string;
  borderColor: string;
}

export default function ProjectsTab({ownerKind, ownerPath, areaName, onOpenItem, viewportHeight, textColor, borderColor}: Props): React.JSX.Element {
  const items = useCachedItems();
  const {kinds} = useLoopKinds();
  const [open, setOpen] = useState<Record<Fold, boolean>>({onHold: false, ideas: false, closed: false});
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('ProjectsTab.action', actionError, () => setActionError(null));
  const today = todayIso();
  const projects = useMemo(
    () => (ownerKind === 'area' ? buildProjectGlance(areaName, items, today, new Date()) : []),
    [ownerKind, areaName, items, today],
  );
  // Keyed on `items`, not on the owner: the cache updates an item in place, so
  // the owner object stays the same when its loops change.
  const loops = useMemo(() => {
    const owner = items.find(i => i.path === ownerPath);
    return owner ? buildLoopGlance(owner, kinds, today, new Date()) : null;
  }, [items, ownerPath, kinds, today]);

  const rows: Row[] = [];
  const fold = (key: Fold, count: number, label: string, children: Row[]) => {
    if (count === 0) return;
    rows.push({kind: 'fold', key: `fold-${key}`, fold: key, count, label: `${count} ${label} ${open[key] ? '▾' : '▸'}`});
    if (open[key]) rows.push(...children);
  };
  const active = projects.filter(g => g.status === 'active');
  const onHold = projects.filter(g => g.status === 'on-hold');
  active.forEach(g => rows.push({kind: 'project', key: g.item.path, glance: g}));
  fold('onHold', onHold.length, 'on hold', onHold.map(g => ({kind: 'project', key: g.item.path, glance: g})));
  if (loops) {
    const anyLoop = loops.active.length + loops.fresh.length + loops.ideas.length + loops.closed.length > 0;
    if (anyLoop && ownerKind === 'area') rows.push({kind: 'head', key: 'head-loops', label: `Loops · ${loops.active.length}`});
    loops.active.forEach(g => rows.push({kind: 'loop', key: `loop-${g.line.tag}`, glance: g, closed: false}));
    if (loops.fresh.length > 0) rows.push({kind: 'head', key: 'head-new', label: 'New · used, no loop yet'});
    loops.fresh.forEach(loop => rows.push({kind: 'new', key: `new-${loop.tag}`, loop}));
    fold('ideas', loops.ideas.length, `loop idea${loops.ideas.length === 1 ? '' : 's'} (Someday)`, loops.ideas.map(loop => ({kind: 'idea', key: `idea-${loop.tag}`, loop})));
    fold('closed', loops.closed.length, 'closed', loops.closed.map(g => ({kind: 'loop', key: `closed-${g.line.tag}`, glance: g, closed: true})));
  }

  const track = (loop: LoopRef) => {
    setActionError(null);
    trackLoop(ownerPath, loop.tag).catch(e => {
      logError('ProjectsTab: track failed', errorMessage(e));
      setActionError(errorMessage(e));
    });
  };
  const openFile = (linkedFile: string) => {
    const paths = getCachedData()?.paths;
    if (!paths) return;
    openLinkedFile(paths, linkedFile).catch(e => {
      logError('ProjectsTab: open linked file failed', errorMessage(e));
      setActionError(errorMessage(e));
    });
  };
  const dateOf = (iso: string) => formatDate(iso, today);
  const openNote = useLoopNote('ProjectsTab');

  const renderRow = (row: Row): React.ReactNode => {
    switch (row.kind) {
      case 'fold':
        return (
          <Pressable
            key={row.key}
            onPress={() => setOpen(o => ({...o, [row.fold]: !o[row.fold]}))}
            style={[styles.row, styles.line, {height: ONE_LINE_HEIGHT, borderColor}]}>
            <Text style={[styles.small, {color: textColor}]}>{row.label}</Text>
          </Pressable>
        );
      case 'head':
        return (
          <Text key={row.key} style={[styles.head, {color: textColor}]}>
            {row.label}
          </Text>
        );
      case 'project': {
        const {item} = row.glance;
        return (
          <TwoLineRow
            key={row.key}
            title={item.name}
            label={row.glance.status === 'on-hold' ? 'on hold' : undefined}
            right={<Text style={[styles.open, {color: textColor}]}>›</Text>}
            line2Left={glanceMeetingText(row.glance, today)}
            line2Right={glanceCountsText(row.glance)}
            onPress={() => onOpenItem?.('project', {name: item.name, path: item.path, isFolder: true})}
            textColor={textColor}
            borderColor={borderColor}
          />
        );
      }
      case 'loop': {
        const {line, loop} = row.glance;
        const file = line.linkedFile;
        return (
          <TwoLineRow
            key={row.key}
            title={`○ ${loop.name}`}
            label={row.closed ? `${loop.kind} · ${line.status}` : loop.kind}
            right={
              <>
                <Pressable onPress={() => openNote(ownerPath, line.tag)} hitSlop={8} accessibilityLabel="Loop note" style={styles.icon}>
                  <Text style={[styles.small, {color: textColor}]}>📓</Text>
                </Pressable>
                {file ? (
                  <Pressable onPress={() => openFile(file)} hitSlop={8} accessibilityLabel="Open linked file" style={styles.icon}>
                    <ClipIcon color={textColor} />
                  </Pressable>
                ) : null}
              </>
            }
            line2Left={loopDateText(row.glance, dateOf)}
            line2Right={glanceCountsText(row.glance)}
            onPress={() => openOverview({tag: line.tag, ownerPath})}
            textColor={textColor}
            borderColor={borderColor}
          />
        );
      }
      case 'new':
        return (
          <View key={row.key} style={[styles.row, styles.line, {height: ONE_LINE_HEIGHT, borderColor}]}>
            <Text style={[styles.name, {color: textColor}]} numberOfLines={1}>
              ○ {row.loop.name}
            </Text>
            <Text style={[styles.small, styles.dim, {color: textColor}]}> {row.loop.kind}</Text>
            <View style={styles.spacer} />
            <Pressable onPress={() => track(row.loop)} hitSlop={8} style={[styles.button, {borderColor}]}>
              <Text style={[styles.small, styles.buttonText, {color: textColor}]}>Track</Text>
            </Pressable>
          </View>
        );
      case 'idea':
        return (
          <View key={row.key} style={[styles.row, styles.line, {height: ONE_LINE_HEIGHT, borderColor}]}>
            <Text style={[styles.small, {color: textColor}]} numberOfLines={1}>
              ○ {row.loop.tag}
            </Text>
          </View>
        );
    }
  };

  const rowHeight = (row: Row): number =>
    row.kind === 'project' || row.kind === 'loop' ? TWO_LINE_ROW_HEIGHT : row.kind === 'head' ? HEAD_HEIGHT : ONE_LINE_HEIGHT;

  return (
    <View style={viewportHeight === undefined ? styles.fill : undefined}>
      <PagedSection
        header={ownerKind === 'area' ? 'Projects' : 'Loops'}
        rows={rows}
        rowHeight={rowHeight}
        isCountableRow={row => row.kind === 'project' || row.kind === 'loop'}
        viewportHeight={viewportHeight}
        resetKey={ownerPath}
        renderRow={renderRow}
        emptyHint={ownerKind === 'area' ? 'No Projects or loops in this Area yet.' : 'No loops in this Project yet.'}
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
  head: {height: HEAD_HEIGHT, paddingTop: 8, fontSize: FONT.small, fontWeight: '700'},
  small: {fontSize: FONT.small},
  dim: {opacity: 0.7},
  spacer: {flex: 1, minWidth: SPACING.sm},
  open: {fontSize: FONT.large, paddingHorizontal: SPACING.sm},
  icon: {paddingHorizontal: SPACING.sm},
  button: {borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4},
  buttonText: {fontWeight: '600'},
});
