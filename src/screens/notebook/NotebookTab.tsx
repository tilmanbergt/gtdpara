/**
 * The Notebook tab of a Project or Area page
 * (docs/dev/history/technical-design-home-notebooks.md §3.4), between the
 * Loops/Projects tab and Files: the home notebook's name and Open, a chip for
 * every year present (current first; a missing current year reads "+ <year>"
 * and creates it), and - without any file - what it will be and Create
 * notebook. The selected chip decides which file Open and the Contents
 * (ContentsSection, when Settings › Advanced › Notebook contents is on) use. The years come
 * from one listing of the notebook's folder, read again when the notebook's
 * state changes (created, deleted); opening and creating go through
 * ui/useHomeNotebookTap.ts's actions.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {homeNotebookEmptyText, homeNotebookMissingYearText, NOTEBOOK_TAB_TEXT, yearChipLabel} from '../../domain/homeNotebook';
import {HomeNotebook, HomeNotebookYearPath, loadHomeNotebookYears} from '../../storage/homeNotebooks';
import {loadSettings} from '../../storage/settingsStorage';
import {NotebookIcon} from '../../ui/icons';
import LoadErrorNotice from '../../ui/LoadErrorNotice';
import PillButton from '../../ui/PillButton';
import {FONT, RADII, SPACING} from '../../ui/theme';
import {HomeNotebookActions} from '../../ui/useHomeNotebookTap';
import {errorMessage} from '../../utils/errorMessage';
import {logError} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import ContentsSection from './ContentsSection';
import {useNotebookContents} from './useNotebookContents';

interface Props {
  nb: HomeNotebook;
  ownerKind: 'project' | 'area';
  actions: HomeNotebookActions;
  viewportHeight?: number;
  textColor: string;
  borderColor: string;
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.note$/, '');

export default function NotebookTab({nb, ownerKind, actions, viewportHeight, textColor, borderColor}: Props): React.JSX.Element {
  const [years, setYears] = useState<HomeNotebookYearPath[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [contentsOn, setContentsOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadSettings()
      .then(settings => {
        setContentsOn(settings.notebookContentsEnabled !== false);
        return loadHomeNotebookYears(nb, settings);
      })
      .then(found => {
        if (cancelled) return;
        setYears(found);
        // The content appears without a tap.
        requestEinkRefresh();
      })
      .catch(e => {
        logError('NotebookTab: years not read', errorMessage(e));
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
    // The notebook's path and state (created, deleted) decide what is there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nb.absolutePath, nb.exists, reload]);

  const current = years?.[0];
  const showing = !!current && (current.exists || selected !== null);
  const shown = years ? years.find(y => y.year === selected && y.exists) ?? (current?.exists ? current : years.find(y => y.exists)) ?? null : null;
  const contents = useNotebookContents(showing && shown ? shown.absolutePath : null, nb.itemPath, contentsOn);

  const fill = viewportHeight === undefined ? styles.fill : undefined;
  if (error) return <View style={fill}><LoadErrorNotice error={error} onRetry={() => setReload(n => n + 1)} textColor={textColor} /></View>;
  if (!years) return <View style={fill}><Text style={[styles.caption, {color: textColor}]}>…</Text></View>;

  if (!current || !shown) {
    return (
      <View style={fill}>
        <Text style={[styles.caption, {color: textColor}]}>{homeNotebookEmptyText(nb.relativeFile, ownerKind)}</Text>
        <View style={styles.actionRow}>
          <PillButton label={NOTEBOOK_TAB_TEXT.create} primary onPress={() => actions.create(nb)} textColor={textColor} borderColor={borderColor} />
        </View>
      </View>
    );
  }

  return (
    <View style={fill}>
      {showing ? (
        <View style={styles.nameRow}>
          <NotebookIcon size={20} color={textColor} />
          <Text style={[styles.name, {color: textColor}]} numberOfLines={1}>
            {baseName(shown.absolutePath)}
          </Text>
          <PillButton label={NOTEBOOK_TAB_TEXT.open} primary onPress={() => actions.open(shown.absolutePath)} textColor={textColor} borderColor={borderColor} />
        </View>
      ) : (
        <Text style={[styles.caption, {color: textColor}]}>{homeNotebookMissingYearText(nb.fileName)}</Text>
      )}
      {years.length > 1 || !current.exists ? (
        <View style={styles.chips}>
          {years.map(y => {
            const isShown = showing && y.absolutePath === shown.absolutePath;
            return (
              <Pressable
                key={y.year}
                onPress={() => (y.exists ? setSelected(y.year) : actions.create(nb))}
                hitSlop={6}
                style={[styles.chip, {borderColor}, isShown && styles.chipSelected, !y.exists && styles.chipMissing]}>
                <Text style={[styles.chipText, {color: textColor}, isShown && styles.chipTextSelected]}>{yearChipLabel(y)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {showing && contents ? (
        <View style={styles.contents}>
          <ContentsSection
            entries={contents}
            onOpenPage={page => actions.open(shown.absolutePath, page)}
            resetKey={shown.absolutePath}
            viewportHeight={viewportHeight === undefined ? undefined : Math.max(0, viewportHeight - CONTENTS_TOP_PX)}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Name row (~36) and one row of year chips (~32 with margins) above the Contents, for a caller's explicit viewport. */
const CONTENTS_TOP_PX = 36 + 32;

const styles = StyleSheet.create({
  fill: {flex: 1},
  caption: {fontSize: FONT.small, marginTop: SPACING.sm, marginBottom: SPACING.sm},
  actionRow: {flexDirection: 'row'},
  nameRow: {flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm},
  name: {flex: 1, fontSize: FONT.medium, fontWeight: '600', marginLeft: SPACING.sm, marginRight: SPACING.sm, marginBottom: 6},
  chips: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 2},
  chip: {borderWidth: 1, borderRadius: RADII.pillSm, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, marginBottom: 6},
  chipSelected: {borderWidth: 2},
  chipMissing: {borderStyle: 'dashed'},
  chipText: {fontSize: FONT.small},
  chipTextSelected: {fontWeight: '700'},
  contents: {flex: 1, marginTop: SPACING.xs},
});
