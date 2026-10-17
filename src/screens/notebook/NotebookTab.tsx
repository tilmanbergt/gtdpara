/**
 * The Notebook tab of a Project or Area page
 * (docs/dev/history/technical-design-home-notebooks.md §3.4), between the
 * Loops/Projects tab and Files: the home notebook's name and Open, a chip for
 * every year present (current first; a missing current year reads "+ <year>"
 * and creates it), and - without any file - what it will be and Create
 * notebook. The selected chip decides which file Open uses. The years come
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

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadSettings()
      .then(settings => loadHomeNotebookYears(nb, settings))
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

  const fill = viewportHeight === undefined ? styles.fill : undefined;
  if (error) return <View style={fill}><LoadErrorNotice error={error} onRetry={() => setReload(n => n + 1)} textColor={textColor} /></View>;
  if (!years) return <View style={fill}><Text style={[styles.caption, {color: textColor}]}>…</Text></View>;

  const current = years[0];
  const anyExists = years.some(y => y.exists);
  if (!anyExists) {
    return (
      <View style={fill}>
        <Text style={[styles.caption, {color: textColor}]}>{homeNotebookEmptyText(nb.relativeFile, ownerKind)}</Text>
        <View style={styles.actionRow}>
          <PillButton label={NOTEBOOK_TAB_TEXT.create} primary onPress={() => actions.create(nb)} textColor={textColor} borderColor={borderColor} />
        </View>
      </View>
    );
  }

  const shown = years.find(y => y.year === selected && y.exists) ?? (current.exists ? current : years.find(y => y.exists)!);
  return (
    <View style={fill}>
      {current.exists || selected !== null ? (
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
            const isShown = y.exists && y.absolutePath === shown.absolutePath && (current.exists || selected !== null);
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
    </View>
  );
}

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
});
