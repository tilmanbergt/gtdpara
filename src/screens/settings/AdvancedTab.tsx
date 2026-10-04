/**
 * Settings → Advanced (docs/dev/technical-design-about-debug-experimental.md §3.6):
 * the Experimental switches, and the tools (Reload all files, Integrity
 * Check, Keep tabs in memory, Performance tracing). Presentational: Settings.tsx owns the values and the handlers,
 * every switch saves immediately.
 */
import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {FONT, SPACING} from '../../ui/theme';
import ProfilesSection from './ProfilesSection';

interface Props {
  activeProfileId: string;
  onSwitchProfile?: (id: string) => Promise<void>;
  experimentalGoogleCalendar: boolean;
  experimentalGmail: boolean;
  perfTracing: boolean;
  keepTabsAlive: boolean;
  integrityCheckRunning: boolean;
  reloading: boolean;
  onReloadAllFiles: () => void;
  onToggleGoogleCalendar: () => void;
  onToggleGmail: () => void;
  onTogglePerfTracing: () => void;
  onToggleKeepTabsAlive: () => void;
  onRunIntegrityCheck: () => void;
  textColor: string;
  borderColor: string;
}

function Switch({
  label,
  on,
  onPress,
  hint,
  textColor,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  hint: string;
  textColor: string;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Pressable onPress={onPress} hitSlop={8} style={styles.button}>
        <Text style={[styles.buttonText, {color: textColor}]}>
          {label}: {on ? 'ON (tap to turn off)' : 'OFF (tap to turn on)'}
        </Text>
      </Pressable>
      <Text style={[styles.hint, {color: textColor}]}>{hint}</Text>
    </View>
  );
}

export default function AdvancedTab(p: Props): React.JSX.Element {
  const {textColor, borderColor} = p;
  return (
    <View style={styles.row}>
      <View style={[styles.column, styles.columnLeft]}>
        <ProfilesSection
          activeProfileId={p.activeProfileId}
          onSwitchProfile={p.onSwitchProfile}
          textColor={textColor}
          borderColor={borderColor}
        />
        <Text style={[styles.heading, {color: textColor}]}>Experimental</Text>
        <Text style={[styles.intro, {color: textColor}]}>
          These integrations depend on outside services and may be slow or stop working. Switching one off only hides it;
          your settings for it are kept.
        </Text>
        <Switch
          label="Google Calendar"
          on={p.experimentalGoogleCalendar}
          onPress={p.onToggleGoogleCalendar}
          hint="Shows your Google Calendar (via its private ICS link) in Daily, Week, Month, Inbox, Projects/Areas and Review, and adds the Calendar tab here in Settings."
          textColor={textColor}
        />
        <Switch
          label="Gmail"
          on={p.experimentalGmail}
          onPress={p.onToggleGmail}
          hint="Adds the Gmail inbox step to the Weekly Review (IMAP with an app password) and the Gmail tab here in Settings."
          textColor={textColor}
        />
      </View>
      <View style={[styles.divider, {backgroundColor: borderColor}]} />
      <View style={styles.column}>
        <Text style={[styles.heading, {color: textColor}]}>Tools</Text>
        <View style={styles.field}>
          <Pressable onPress={p.onReloadAllFiles} disabled={p.reloading} hitSlop={8} style={styles.button}>
            <Text style={[styles.buttonText, {color: textColor}]}>Reload all files</Text>
          </Pressable>
          {p.reloading && <ActivityIndicator style={styles.spinner} />}
          <Text style={[styles.hint, {color: textColor}]}>
            Reads all projects, areas and the Inbox again. Opening gtdpara already reads files changed outside it (on
            your computer, in Obsidian); use this when a change still doesn't show up.
          </Text>
        </View>
        <View style={styles.field}>
          <Pressable onPress={p.onRunIntegrityCheck} disabled={p.integrityCheckRunning} hitSlop={8} style={styles.button}>
            <Text style={[styles.buttonText, {color: textColor}]}>Run Integrity Check</Text>
          </Pressable>
          {p.integrityCheckRunning && <ActivityIndicator style={styles.spinner} />}
          <Text style={[styles.hint, {color: textColor}]}>
            Scans every Project/Area/Archive/Inbox for known notePath problems and writes a report to EXPORT/gtdpara/debug.
          </Text>
        </View>
        <Switch
          label="Keep tabs in memory"
          on={p.keepTabsAlive}
          onPress={p.onToggleKeepTabsAlive}
          hint="Daily, Week, Month, Current, Projects and Areas stay loaded after their first visit, so switching back is fast. Turn off if something looks wrong."
          textColor={textColor}
        />
        <Switch
          label="Performance tracing"
          on={p.perfTracing}
          onPress={p.onTogglePerfTracing}
          hint="Records how long each tab switch, reopen and cold start takes and writes one small file per event to EXPORT/gtdpara/debug/perf."
          textColor={textColor}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', flex: 1},
  column: {flex: 1},
  columnLeft: {marginRight: SPACING.base},
  divider: {width: 1, marginRight: SPACING.base},
  heading: {fontSize: FONT.medium, fontWeight: '700', marginBottom: SPACING.sm},
  intro: {fontSize: FONT.small, opacity: 0.7, marginBottom: SPACING.base},
  field: {marginBottom: 18},
  button: {alignSelf: 'flex-start'},
  buttonText: {fontSize: FONT.small, fontWeight: '600', textDecorationLine: 'underline'},
  hint: {fontSize: FONT.small, opacity: 0.6, marginTop: 4},
  spinner: {marginTop: SPACING.sm, alignSelf: 'flex-start'},
});
