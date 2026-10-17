/**
 * The notebook icon of a Project or Area
 * (docs/dev/history/technical-design-home-notebooks.md §3.3): plain when its
 * home notebook exists (a tap opens it), with a + when it doesn't (a tap
 * creates it after a confirm). Nothing when the item has no home notebook.
 * The tap itself is ui/useHomeNotebookTap.ts's; this is only the control.
 *
 * - `icon`: a 44 × 36 touch target for rows (`HOME_NOTEBOOK_ICON_WIDTH`).
 * - `labeled`: icon + "Notebook" as a pill, for the Project/Area page header.
 *
 * Until the state cache knows whether the file exists, the space is kept
 * empty, so the row doesn't reflow and no wrong icon is drawn.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {HomeNotebook} from '../storage/homeNotebooks';
import {NotebookIcon} from './icons';
import {FONT, RADII} from './theme';

/** Width the `icon` variant takes in a row (dp), for the rows' line estimates. */
export const HOME_NOTEBOOK_ICON_WIDTH = 44;
/** Height of the `icon` variant's touch target (dp); rows are at least this tall. */
export const HOME_NOTEBOOK_ICON_HEIGHT = 36;

const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};

interface Props {
  nb: HomeNotebook | null;
  onPress: (nb: HomeNotebook) => void;
  variant: 'icon' | 'labeled';
  textColor: string;
  borderColor: string;
}

export default function HomeNotebookButton({nb, onPress, variant, textColor, borderColor}: Props): React.JSX.Element | null {
  if (!nb) return null;
  const label = `${nb.exists ? 'Open' : 'Create'} ${nb.fileName}`;
  if (variant === 'icon') {
    if (!nb.known) return <View style={styles.icon} />;
    return (
      <Pressable onPress={() => onPress(nb)} accessibilityLabel={label} style={styles.icon}>
        <NotebookIcon color={textColor} plus={!nb.exists} />
      </Pressable>
    );
  }
  if (!nb.known) return null;
  return (
    <Pressable onPress={() => onPress(nb)} accessibilityLabel={label} hitSlop={HIT_SLOP} style={[styles.pill, {borderColor}]}>
      <NotebookIcon size={20} color={textColor} plus={!nb.exists} />
      <Text style={[styles.pillText, {color: textColor}]}>Notebook</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: HOME_NOTEBOOK_ICON_WIDTH,
    height: HOME_NOTEBOOK_ICON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same outline, radius and margins as ui/PillButton.tsx, so it sits level with "Engage ›" next to it.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADII.pillMd,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 6,
  },
  pillText: {
    fontSize: FONT.small,
    fontWeight: '600',
    marginLeft: 6,
  },
});
