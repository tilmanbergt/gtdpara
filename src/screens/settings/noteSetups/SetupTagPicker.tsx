/**
 * The tag picker of a setup (docs/dev/history/technical-design-note-setups.md
 * §6.2): the tags in use, their types first, as chips - a tap picks or
 * unpicks one; tags another setup holds are left out (one tag, one setup).
 * A new tag is typed in the field on top.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {setupTagChoices} from '../../../domain/noteSetupText';
import {GtdParaSettings} from '../../../domain/settings';
import {getRecentTags} from '../../../storage/tagUsage';
import ClipboardTextInput from '../../../ui/ClipboardTextInput';
import TagChipGrid from '../../../ui/TagChipGrid';
import {errorMessage} from '../../../utils/errorMessage';
import {logWarn} from '../../../utils/log';
import {useEinkRefreshOnLoad} from '../../../utils/screenRefresh';
import {styles} from '../settingsStyles';
import {setupStyles} from './noteSetupsStyles';
import {NoteSetupDraft} from './useNoteSetupDraft';

export default function SetupTagPicker(props: {
  draft: NoteSetupDraft;
  values: GtdParaSettings;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element | null {
  const {draft, values, textColor, borderColor, placeholderColor} = props;
  const [recent, setRecent] = useState<string[] | null>(null);
  // The chips appear without a tap.
  useEinkRefreshOnLoad(recent === null);
  useEffect(() => {
    let cancelled = false;
    getRecentTags()
      .then(tags => {
        if (!cancelled) setRecent(tags);
      })
      .catch(e => {
        logWarn('SetupTagPicker: reading tags in use failed', errorMessage(e));
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const target = draft.target;
  if (target?.kind !== 'setup') return null;
  const {setup} = target;
  const choices = setupTagChoices(recent ?? [], values.noteSetups, setup.id, setup.tags);
  return (
    <View style={setupStyles.page}>
      <View style={setupStyles.headerRow}>
        <Pressable onPress={() => draft.setView('setup')} hitSlop={8}>
          <Text style={[setupStyles.headerBack, {color: textColor}]}>{`‹ ${setup.name.trim() || 'New note setup'}`}</Text>
        </Pressable>
        <Text style={[setupStyles.headerTitle, {color: textColor}]}>Tags</Text>
        <Pressable onPress={() => draft.setView('setup')} hitSlop={8}>
          <Text style={[setupStyles.headerAction, {color: textColor}]}>Done</Text>
        </Pressable>
      </View>
      <Text style={[styles.label, {color: textColor}]}>New tag</Text>
      <View style={setupStyles.fieldRow}>
        <View style={[setupStyles.fieldControl, styles.clipboardFieldRow]}>
          <ClipboardTextInput
            value={draft.newTagText}
            onChangeText={draft.setNewTagText}
            placeholder={setup.kind === 'loop' ? 'e.g. workshop' : 'e.g. sparring'}
            placeholderColor={placeholderColor}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
        <Pressable onPress={draft.handleAddNewTag} hitSlop={8} style={[setupStyles.pageRowButton, {borderColor}]}>
          <Text style={[setupStyles.pageRowButtonText, {color: textColor}]}>Add</Text>
        </Pressable>
      </View>
      <Text style={[styles.label, {color: textColor}]}>
        {recent === null ? 'Tags in use: loading…' : 'Tags in use (tags of other setups are left out)'}
      </Text>
      <TagChipGrid
        chips={choices.map(tag => ({key: tag, label: `#${tag}`, on: setup.tags.includes(tag), onPress: () => draft.handleToggleTag(tag)}))}
        maxChips={40}
        maxLabelChars={24}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}
