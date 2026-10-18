/**
 * The setup page's fields (docs/dev/history/technical-design-note-setups.md
 * §6.2): name, tags, kind, where notes go, tracking, enabled. The Default
 * shows only where notes go and tracking. Every input sits in the upper
 * part of the screen, above the pages.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {todayIso} from '../../../domain/meetingTime';
import {LOOP_NOTE_NAME_DEFAULT, Notebook} from '../../../domain/noteSetups';
import {DEFAULT_NOTEBOOK_HOME_HINT, loopNotePreviews, notebookPreviews} from '../../../domain/noteSetupText';
import ClipboardTextInput from '../../../ui/ClipboardTextInput';
import MiniTabs, {MiniTabDef} from '../../../ui/MiniTabs';
import CheckToggle from '../CheckToggle';
import {styles} from '../settingsStyles';
import NoteNameField from './NoteNameField';
import {setupStyles} from './noteSetupsStyles';
import {NoteSetupDraft} from './useNoteSetupDraft';

const KIND_TABS: MiniTabDef<'thread' | 'loop'>[] = [
  {key: 'thread', label: 'Thread'},
  {key: 'loop', label: 'Loop'},
];

const NOTES_TABS: MiniTabDef<'own' | 'notebook'>[] = [
  {key: 'own', label: 'Own note per item'},
  {key: 'notebook', label: 'One notebook'},
];

interface Colors {
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

/** Own note per item / One notebook, with the notebook's name and folder (Thread setups and the Default). */
function NotebookFields(props: {draft: NoteSetupDraft; notebook: Notebook | null; fallbackName: string; tags: readonly string[]} & Colors): React.JSX.Element {
  const {draft, notebook, fallbackName, tags, textColor, borderColor, placeholderColor} = props;
  return (
    <>
      <View style={setupStyles.fieldRow}>
        <Text style={[setupStyles.fieldLabel, {color: textColor}]}>Notes</Text>
        <View style={setupStyles.fieldControl}>
          <MiniTabs
            tabs={NOTES_TABS}
            activeKey={notebook ? 'notebook' : 'own'}
            onChange={key => draft.handleSetNotebookOn(key === 'notebook')}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      </View>
      {notebook && (
        <>
          <NoteNameField
            label="Notebook name"
            value={notebook.name}
            onChange={name => draft.handleUpdateNotebook({name})}
            placeholder={fallbackName}
            inputRef={draft.notebookNameRef}
            examples={notebookPreviews(notebook.name, fallbackName, tags, notebook.folder.trim(), todayIso())}
            textColor={textColor}
            borderColor={borderColor}
            placeholderColor={placeholderColor}
          />
          <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Folder (empty = the Area or Project folder)</Text>
          <View style={styles.clipboardFieldRow}>
            <ClipboardTextInput
              value={notebook.folder}
              onChangeText={folder => draft.handleUpdateNotebook({folder})}
              placeholder="e.g. Meetings"
              placeholderColor={placeholderColor}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>
        </>
      )}
    </>
  );
}

function TrackingFields(props: {draft: NoteSetupDraft; trackPrep: boolean; trackReview: boolean; textColor: string}): React.JSX.Element {
  const {draft, trackPrep, trackReview, textColor} = props;
  return (
    <View style={setupStyles.fieldRow}>
      <Text style={[setupStyles.fieldLabel, {color: textColor}]}>Tracking</Text>
      <View style={styles.toggleRowInline}>
        <CheckToggle inline label="Prepare before" checked={trackPrep} onPress={() => draft.handleToggleTracking('trackPrep')} textColor={textColor} />
        <CheckToggle inline label="Review after" checked={trackReview} onPress={() => draft.handleToggleTracking('trackReview')} textColor={textColor} />
      </View>
    </View>
  );
}

export default function SetupFields(props: {draft: NoteSetupDraft} & Colors): React.JSX.Element | null {
  const {draft, textColor, borderColor, placeholderColor} = props;
  const target = draft.target;
  if (!target) return null;
  const colors = {textColor, borderColor, placeholderColor};

  if (target.kind === 'default') {
    const {defaults} = target;
    return (
      <View>
        <Text style={[setupStyles.fieldHint, {color: textColor}]}>For every todo and meeting no setup matches.</Text>
        <NotebookFields draft={draft} notebook={defaults.notebook ?? null} fallbackName="Notes" tags={[]} {...colors} />
        {defaults.notebook && <Text style={[setupStyles.fieldHint, {color: textColor}]}>{DEFAULT_NOTEBOOK_HOME_HINT}</Text>}
        <TrackingFields draft={draft} trackPrep={defaults.tracking.trackPrep} trackReview={defaults.tracking.trackReview} textColor={textColor} />
      </View>
    );
  }

  const {setup} = target;
  return (
    <View>
      <View style={setupStyles.fieldRow}>
        <Text style={[setupStyles.fieldLabel, {color: textColor}]}>Name</Text>
        <View style={[setupStyles.fieldControl, styles.clipboardFieldRow]}>
          <ClipboardTextInput
            value={setup.name}
            onChangeText={name => draft.updateSetup({name})}
            placeholder="e.g. Sparring"
            placeholderColor={placeholderColor}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      </View>

      <View style={setupStyles.fieldRow}>
        <Text style={[setupStyles.fieldLabel, {color: textColor}]}>Tags</Text>
        <View style={setupStyles.tagRow}>
          {setup.tags.map(tag => (
            <View key={tag} style={[setupStyles.tagChip, {borderColor}]}>
              <Text style={[setupStyles.tagChipText, {color: textColor}]}>{`#${tag}`}</Text>
              <Pressable onPress={() => draft.handleRemoveTag(tag)} hitSlop={8}>
                <Text style={[setupStyles.tagChipRemove, {color: textColor}]}>✕</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => draft.setView('tags')} hitSlop={8}>
            <Text style={[setupStyles.linkText, {color: textColor}]}>+ tag</Text>
          </Pressable>
        </View>
      </View>

      <View style={setupStyles.fieldRow}>
        <Text style={[setupStyles.fieldLabel, {color: textColor}]}>Kind</Text>
        <View style={setupStyles.fieldControl}>
          <MiniTabs tabs={KIND_TABS} activeKey={setup.kind} onChange={draft.handleSetKind} textColor={textColor} borderColor={borderColor} />
        </View>
      </View>
      <Text style={[setupStyles.fieldHint, {color: textColor}]}>
        {setup.kind === 'thread'
          ? 'Tended with someone: #sparring/peter is the thread with Peter.'
          : 'A small project of its own: #workshop/offsite is one loop.'}
      </Text>

      {setup.kind === 'thread' ? (
        <NotebookFields draft={draft} notebook={setup.notebook} fallbackName={setup.name || 'Notes'} tags={setup.tags} {...colors} />
      ) : (
        <NoteNameField
          label="Loop note name"
          value={setup.notebook?.name ?? ''}
          onChange={name => draft.handleUpdateNotebook({name})}
          placeholder={LOOP_NOTE_NAME_DEFAULT}
          inputRef={draft.notebookNameRef}
          examples={loopNotePreviews(setup.notebook?.name ?? '', setup.tags, todayIso())}
          hint="Dates are the loop's main date, left out while it has none. The note lives in the loop's Area or Project folder."
          textColor={textColor}
          borderColor={borderColor}
          placeholderColor={placeholderColor}
        />
      )}

      <TrackingFields draft={draft} trackPrep={setup.tracking.trackPrep} trackReview={setup.tracking.trackReview} textColor={textColor} />
      <CheckToggle label="Enabled" checked={setup.enabled} onPress={() => draft.updateSetup({enabled: !setup.enabled})} textColor={textColor} />
    </View>
  );
}
