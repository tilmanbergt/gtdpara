/**
 * The Settings tabs that edit the shared draft (useSettingsDraft.ts) and are
 * written by Save: Folders, Focus, Calendar and Gmail.
 */
import React from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {DEFAULT_SETTINGS, resolvePaths} from '../../domain/settings';
import CheckToggle from './CheckToggle';
import {styles} from './settingsStyles';
import {FIELDS, FOCUS_COUNT_FIELDS, SettingsDraft} from './useSettingsDraft';

interface TabProps {
  draft: SettingsDraft;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

/** The base root and each PARA folder, with the resolved path under each. */
export function FoldersTab({draft, textColor, borderColor, placeholderColor}: TabProps): React.JSX.Element {
  const paths = resolvePaths(draft.values);
  return (
    <>
      {FIELDS.map(field => (
        <View key={field.key} style={styles.field}>
          <Text style={[styles.label, {color: textColor}]}>{field.label}</Text>
          <TextInput
            style={[styles.input, {color: textColor, borderColor}]}
            value={draft.values[field.key]}
            onChangeText={text => draft.update(field.key, text)}
            placeholder={field.placeholder}
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {field.pathKey && <Text style={[styles.pathPreview, {color: textColor}]}>→ {paths[field.pathKey]}</Text>}
        </View>
      ))}
    </>
  );
}

/** How many Projects/Areas fit in Daily, Weekly and Monthly focus. */
export function FocusTab({draft, textColor, borderColor, placeholderColor}: TabProps): React.JSX.Element {
  return (
    <>
      {FOCUS_COUNT_FIELDS.map(field => (
        <View key={field.key} style={styles.field}>
          <Text style={[styles.label, {color: textColor}]}>{field.label}</Text>
          <TextInput
            style={[styles.input, styles.countInput, {color: textColor, borderColor}]}
            value={draft.focusCountText[field.key]}
            onChangeText={text => draft.updateFocusCount(field.key, text)}
            placeholder={String(DEFAULT_SETTINGS[field.key])}
            placeholderTextColor={placeholderColor}
            keyboardType="number-pad"
          />
        </View>
      ))}
    </>
  );
}

/** The Google Calendar ICS link. */
export function CalendarTab({draft, textColor, borderColor, placeholderColor}: TabProps): React.JSX.Element {
  const setUrl = (text: string) => draft.patch({googleCalendarIcsUrl: text});
  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: textColor}]}>Google Calendar ICS link</Text>
      <TextInput
        style={[styles.input, {color: textColor, borderColor}]}
        value={draft.values.googleCalendarIcsUrl}
        onChangeText={setUrl}
        placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable onPress={() => draft.pasteInto(setUrl)} hitSlop={8} style={styles.pasteButton}>
        <Text style={styles.pasteButtonText}>Paste from clipboard</Text>
      </Pressable>
      <Text style={[styles.pathPreview, {color: textColor}]}>
        The first sync will ask for network access - fetches only today through +30 days.
      </Text>
    </View>
  );
}

/** Gmail address, app password (pasted - nobody types Google's generated 16 characters), IMAP host. */
export function GmailTab({draft, textColor, borderColor, placeholderColor}: TabProps): React.JSX.Element {
  const {values, update} = draft;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: textColor}]}>Gmail address</Text>
      <TextInput
        style={[styles.input, {color: textColor, borderColor}]}
        value={values.gmailEmail}
        onChangeText={text => update('gmailEmail', text)}
        placeholder="you@gmail.com"
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />

      <Text style={[styles.label, {color: textColor}]}>App password</Text>
      <TextInput
        style={[styles.input, {color: textColor, borderColor}]}
        value={values.gmailAppPassword}
        onChangeText={text => update('gmailAppPassword', text)}
        placeholder="16-character app password"
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Pressable onPress={() => draft.pasteInto(text => update('gmailAppPassword', text))} hitSlop={8} style={styles.pasteButton}>
        <Text style={styles.pasteButtonText}>Paste from clipboard</Text>
      </Pressable>
      <Text style={[styles.pathPreview, {color: textColor}]}>
        Not your Google password - generate a dedicated app password at myaccount.google.com/apppasswords
        (requires 2-Step Verification to be on).
      </Text>

      <Text style={[styles.label, {color: textColor}]}>IMAP host (advanced)</Text>
      <TextInput
        style={[styles.input, {color: textColor, borderColor}]}
        value={values.gmailImapHost}
        onChangeText={text => update('gmailImapHost', text)}
        placeholder={DEFAULT_SETTINGS.gmailImapHost}
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={[styles.pathPreview, {color: textColor}]}>Leave this as-is unless you know you need something else.</Text>

      <CheckToggle
        label="Hide emails already turned into a Task/Meeting"
        checked={values.gmailHideHandled}
        onPress={() => draft.patch({gmailHideHandled: !values.gmailHideHandled})}
        textColor={textColor}
      />
    </View>
  );
}
