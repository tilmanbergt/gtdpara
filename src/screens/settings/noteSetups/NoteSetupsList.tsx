/**
 * The list of Note setups (docs/dev/history/technical-design-note-setups.md
 * §6.1): the heading style, the migration notice while it is kept,
 * "+ New note setup", the Default pinned on top, then the setups, paged.
 * Delete is immediate.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {NoteSetup} from '../../../domain/noteSetups';
import {defaultRowSummary, SETUP_KIND_LABELS, setupRowSummary} from '../../../domain/noteSetupText';
import {GtdParaSettings, NoteHeadingStyle} from '../../../domain/settings';
import MiniTabs, {MiniTabDef} from '../../../ui/MiniTabs';
import PagedSection from '../../../ui/PagedSection';
import {styles} from '../settingsStyles';
import MigrationNotice from './MigrationNotice';
import {SETUP_ROW_HEIGHT, setupStyles} from './noteSetupsStyles';
import {NoteSetupDraft} from './useNoteSetupDraft';

/** sn-plugin-lib's title styles, as the Heading style choice (docs/dev/history/technical-design-projects-findable-notes.md §2.8). */
const HEADING_STYLE_TABS: MiniTabDef<'1' | '2' | '3' | '4'>[] = [
  {key: '1', label: 'Black'},
  {key: '2', label: 'Light grey'},
  {key: '3', label: 'Dark grey'},
  {key: '4', label: 'Shadow'},
];

interface Row {
  setup: NoteSetup;
  index: number;
}

export default function NoteSetupsList(props: {
  draft: NoteSetupDraft;
  values: GtdParaSettings;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const {draft, values, textColor, borderColor} = props;
  return (
    <View style={setupStyles.page}>
      <Text style={[styles.label, {color: textColor}]}>Heading style</Text>
      <MiniTabs
        tabs={HEADING_STYLE_TABS}
        activeKey={String(values.noteHeadingStyle) as '1' | '2' | '3' | '4'}
        onChange={key => draft.handleSetHeadingStyle(Number(key) as NoteHeadingStyle)}
        textColor={textColor}
        borderColor={borderColor}
      />
      {values.noteSetupsNotice && (
        <MigrationNotice report={values.noteSetupsNotice} onDismiss={draft.handleDismissNotice} textColor={textColor} borderColor={borderColor} />
      )}
      <Pressable onPress={draft.handleNewSetup} hitSlop={8} style={styles.addDefRow}>
        <Text style={[styles.addDefRowText, {color: textColor}]}>+ New note setup</Text>
      </Pressable>
      <Pressable onPress={draft.handleEditDefault} hitSlop={4} style={[setupStyles.setupRow, setupStyles.defaultRow, {borderColor}]}>
        <View style={setupStyles.setupRowMain}>
          <Text style={[setupStyles.setupRowName, {color: textColor}]} numberOfLines={1}>
            Default
          </Text>
          <Text style={[setupStyles.setupRowMeta, {color: textColor}]} numberOfLines={1}>
            {defaultRowSummary(values.noteSetupDefaults)}
          </Text>
        </View>
      </Pressable>
      <View style={setupStyles.listBody}>
        <PagedSection<Row>
          header="Note setups"
          rows={values.noteSetups.map((setup, index) => ({setup, index}))}
          rowHeight={() => SETUP_ROW_HEIGHT}
          resetKey={values.noteSetups.length}
          emptyHint="None yet - every note uses the Default. A setup gives notes of items with its tags their own place and pages."
          renderRow={({setup, index}) => (
            <View key={setup.id} style={[setupStyles.setupRow, {borderColor}]}>
              <Pressable onPress={() => draft.handleEditSetup(index)} hitSlop={4} style={setupStyles.setupRowMain}>
                <View style={setupStyles.setupRowTop}>
                  <Text style={[setupStyles.setupRowName, {color: textColor}]} numberOfLines={1}>
                    {setup.name}
                    {setup.enabled ? '' : '  (off)'}
                  </Text>
                  <Text style={[setupStyles.setupRowKind, {color: textColor}]}>{SETUP_KIND_LABELS[setup.kind]}</Text>
                </View>
                <Text style={[setupStyles.setupRowMeta, {color: textColor}]} numberOfLines={1}>
                  {setupRowSummary(setup)}
                </Text>
              </Pressable>
              <Pressable onPress={() => draft.handleDeleteSetup(index)} hitSlop={8} style={setupStyles.rowDelete}>
                <Text style={[setupStyles.rowDeleteText, {color: textColor}]}>Delete</Text>
              </Pressable>
            </View>
          )}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
    </View>
  );
}
