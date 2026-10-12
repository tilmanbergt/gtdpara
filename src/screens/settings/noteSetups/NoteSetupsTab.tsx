/**
 * Settings → Note setups (docs/dev/history/technical-design-note-setups.md §6).
 * The heading style of the headings gtdpara writes into notes, and the
 * Note setups themselves.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {NoteHeadingStyle} from '../../../domain/settings';
import MiniTabs, {MiniTabDef} from '../../../ui/MiniTabs';
import {styles} from '../settingsStyles';

/** sn-plugin-lib's title styles, as the Heading style choice (docs/dev/history/technical-design-projects-findable-notes.md §2.8). */
const HEADING_STYLE_TABS: MiniTabDef<'1' | '2' | '3' | '4'>[] = [
  {key: '1', label: 'Black'},
  {key: '2', label: 'Light grey'},
  {key: '3', label: 'Dark grey'},
  {key: '4', label: 'Shadow'},
];

export default function NoteSetupsTab(props: {
  headingStyle: NoteHeadingStyle;
  onSetHeadingStyle: (style: NoteHeadingStyle) => void;
  setupCount: number;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const {headingStyle, onSetHeadingStyle, setupCount, textColor, borderColor} = props;
  return (
    <View style={styles.templatesListBody}>
      <Text style={[styles.label, {color: textColor}]}>Heading style</Text>
      <MiniTabs
        tabs={HEADING_STYLE_TABS}
        activeKey={String(headingStyle) as '1' | '2' | '3' | '4'}
        onChange={key => onSetHeadingStyle(Number(key) as NoteHeadingStyle)}
        textColor={textColor}
        borderColor={borderColor}
      />
      <Text style={[styles.label, {color: textColor}]}>Note setups - editor follows</Text>
      <Text style={[styles.label, {color: textColor}]}>{`Note setups in use: ${setupCount}`}</Text>
    </View>
  );
}
