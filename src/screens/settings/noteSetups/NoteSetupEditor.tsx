/**
 * The setup page (docs/dev/history/technical-design-note-setups.md §6.2):
 * what a setup - or the Default - does, and a row per page. Save and
 * Cancel sit top right; a page's layout opens on its own page.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {GtdParaSettings} from '../../../domain/settings';
import {styles} from '../settingsStyles';
import PageRows from './PageRows';
import SetupFields from './SetupFields';
import {setupStyles} from './noteSetupsStyles';
import {NoteSetupDraft} from './useNoteSetupDraft';

export default function NoteSetupEditor(props: {
  draft: NoteSetupDraft;
  values: GtdParaSettings;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element | null {
  const {draft, values, textColor, borderColor, placeholderColor} = props;
  const target = draft.target;
  if (!target) return null;
  const title = target.kind === 'default' ? 'Default' : target.setup.name.trim() || 'New note setup';
  return (
    <View style={setupStyles.page}>
      <View style={setupStyles.headerRow}>
        <Pressable onPress={draft.handleCancel} hitSlop={8}>
          <Text style={[setupStyles.headerBack, {color: textColor}]}>‹ Note setups</Text>
        </Pressable>
        <Text style={[setupStyles.headerTitle, {color: textColor}]} numberOfLines={1}>
          {title}
        </Text>
        <View style={setupStyles.headerButtons}>
          <Pressable style={[styles.saveButton, styles.saveButtonWide, setupStyles.headerSave]} onPress={draft.handleSave}>
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={draft.handleCancel} hitSlop={8}>
            <Text style={[styles.cancelButtonText, {color: textColor}]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
      <SetupFields draft={draft} textColor={textColor} borderColor={borderColor} placeholderColor={placeholderColor} />
      <View style={setupStyles.pagesBody}>
        <PageRows draft={draft} values={values} textColor={textColor} borderColor={borderColor} />
      </View>
    </View>
  );
}
