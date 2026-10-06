/**
 * Settings → Advanced → Profiles (docs/dev/technical-design-profiles-demo-space.md §3.6):
 * the profile files in EXPORT/gtdpara/profiles, Save for the active one,
 * Switch (after a confirm in the status slot) for the others, and
 * "Create demo space". The actual switch - reset caches, remount the app -
 * is done by App.tsx via `onSwitchProfile`.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {DEFAULT_PROFILE_ID} from '../../domain/profiles';
import {createDemoSpace} from '../../storage/demoSpace';
import {ensureDefaultProfileFile, listProfiles, ProfileInfo, saveActiveProfile} from '../../storage/profiles';
import {displayPath, PROFILES_FOLDER_PATH} from '../../supernote/fileSystem';
import PillButton from '../../ui/PillButton';
import {useStatus} from '../../ui/status/StatusProvider';
import {FONT, SPACING} from '../../ui/theme';
import {logError} from '../../utils/log';
import {errorMessage} from '../../utils/errorMessage';

interface Props {
  activeProfileId: string;
  /** Performs the switch (App.tsx); resolves after the app has been reset, or rejects with a message. */
  onSwitchProfile?: (id: string) => Promise<void>;
  textColor: string;
  borderColor: string;
}

type Message = {kind: 'success' | 'error'; text: string} | null;

function errorText(e: unknown): string {
  return errorMessage(e);
}

export default function ProfilesSection({activeProfileId, onSwitchProfile, textColor, borderColor}: Props): React.JSX.Element {
  const [profiles, setProfiles] = useState<ProfileInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useStatus('Settings.profiles.message', message ? {...message, onDismiss: () => setMessage(null)} : null);

  const reload = useCallback(async () => {
    try {
      await ensureDefaultProfileFile();
      setProfiles(await listProfiles());
    } catch (e) {
      logError('ProfilesSection: listing profiles failed', errorText(e));
      setProfiles([]);
      setMessage({kind: 'error', text: `Profiles: ${errorText(e)}`});
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      setMessage({kind: 'success', text});
      await reload();
    } catch (e) {
      setMessage({kind: 'error', text: errorText(e)});
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () =>
    run(async () => {
      const id = await saveActiveProfile();
      return `Saved to ${displayPath(PROFILES_FOLDER_PATH)}/${id}.json`;
    });

  const handleDemo = () =>
    run(async () => {
      const r = await createDemoSpace();
      const files = r.written > 0 ? `${r.written} demo files written to Note/gtdpara-demo` : 'demo files already in Note/gtdpara-demo';
      return `${files}${r.skipped > 0 && r.written > 0 ? `, ${r.skipped} kept` : ''}${r.profileCreated ? ', profile "Demo" added' : ''}.`;
    });

  const confirmTarget = profiles?.find(p => p.id === confirmId) ?? null;
  useStatus(
    'Settings.profiles.confirm',
    confirmTarget && onSwitchProfile
      ? {
          kind: 'confirm',
          text: `Switch to profile "${confirmTarget.name}"? The current profile is saved first.`,
          actions: [
            {
              label: 'Switch',
              primary: true,
              onPress: () => {
                const id = confirmTarget.id;
                setConfirmId(null);
                setBusy(true);
                onSwitchProfile(id).catch(e => {
                  setBusy(false);
                  setMessage({kind: 'error', text: `Switching failed: ${errorText(e)}`});
                });
              },
            },
          ],
          onCancel: () => setConfirmId(null),
        }
      : null,
  );

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, {color: textColor}]}>Profiles</Text>
        {busy && <ActivityIndicator style={styles.spinner} />}
      </View>
      <Text style={[styles.intro, {color: textColor}]}>
        A profile holds folders, focus counts, Tag Rules, review state, integrations and the experimental switches. Use a
        demo or test profile to try things without touching your real data.
      </Text>
      {profiles === null ? (
        <ActivityIndicator style={styles.spinner} />
      ) : (
        <View style={[styles.list, {borderColor}]}>
          {profiles.map(p => {
            const active = p.id === activeProfileId;
            return (
              <View key={p.id} style={[styles.row, {borderColor}]}>
                <Text style={[styles.rowName, {color: textColor}, active && styles.bold]} numberOfLines={1}>
                  {active ? '● ' : '○ '}
                  {p.name}
                  {p.id === DEFAULT_PROFILE_ID ? '' : `  (${p.id})`}
                </Text>
                <Text style={[styles.rowMeta, {color: textColor}]} numberOfLines={1}>
                  {p.error ? `can't be used: ${p.error}` : p.savedAt ? `saved ${p.savedAt.slice(0, 10)}` : ''}
                </Text>
                {active ? (
                  <PillButton label="Save" disabled={busy} onPress={handleSave} textColor={textColor} borderColor={borderColor} />
                ) : (
                  <PillButton
                    label="Switch"
                    disabled={busy || !!p.error || !onSwitchProfile}
                    onPress={() => setConfirmId(p.id)}
                    textColor={textColor}
                    borderColor={borderColor}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
      <View style={styles.actions}>
        <PillButton label="Create demo space" disabled={busy} onPress={handleDemo} textColor={textColor} borderColor={borderColor} />
        <Pressable onPress={reload} hitSlop={8} style={styles.link}>
          <Text style={[styles.linkText, {color: textColor}]}>Refresh list</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, {color: textColor}]}>
        Profile files: {displayPath(PROFILES_FOLDER_PATH)} - copy .json files there to import them. Passwords and calendar
        links are never written into these files. The demo space lives in Note/gtdpara-demo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {marginBottom: SPACING.lg},
  headerRow: {flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm},
  heading: {fontSize: FONT.medium, fontWeight: '700'},
  spinner: {marginLeft: SPACING.sm},
  intro: {fontSize: FONT.small, opacity: 0.7, marginBottom: SPACING.sm},
  list: {borderTopWidth: 1, marginBottom: SPACING.sm},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1},
  rowName: {flex: 1, fontSize: FONT.medium},
  rowMeta: {fontSize: FONT.small, opacity: 0.6, marginHorizontal: SPACING.sm, maxWidth: 220},
  bold: {fontWeight: '700'},
  actions: {flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs},
  link: {marginLeft: SPACING.base},
  linkText: {fontSize: FONT.small, fontWeight: '600', textDecorationLine: 'underline'},
  hint: {fontSize: FONT.small, opacity: 0.6, marginTop: 4},
});
