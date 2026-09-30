/**
 * Settings → About (docs/dev/technical-design-about-debug-experimental.md §3.5):
 * left - version/build/device, Debug logging switch, Export debug bundle;
 * right - "What's new" from the bundled CHANGELOG, paged, no scrolling.
 */
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {GtdParaSettings} from '../../domain/settings';
import {BUILD_INFO} from '../../generated/buildInfo';
import {CHANGELOG} from '../../generated/changelog';
import {exportDebugBundle} from '../../storage/debugBundle';
import {loadSettings} from '../../storage/settingsStorage';
import {DEBUG_LOG_FOLDER_PATH, displayPath} from '../../supernote/fileSystem';
import {getRuntimeDiagnostics, RuntimeDiagnostics} from '../../supernote/pluginRuntime';
import MarkdownPager from '../../ui/MarkdownBlocks';
import MiniTabs, {MiniTabDef} from '../../ui/MiniTabs';
import PillButton from '../../ui/PillButton';
import {useStatus} from '../../ui/status/StatusProvider';
import {FONT, SPACING} from '../../ui/theme';
import {LOG_FILE_NAME} from '../../utils/logSink';
import {logError} from '../../utils/log';

const PROJECT_URL = 'github.com/tilmanbergt/gtdpara';

interface Props {
  debugLogging: boolean;
  onToggleDebugLogging: () => void;
  textColor: string;
  borderColor: string;
}

const shortFolder = displayPath;

export default function AboutTab({debugLogging, onToggleDebugLogging, textColor, borderColor}: Props): React.JSX.Element {
  const b = BUILD_INFO;
  const [diag, setDiag] = useState<RuntimeDiagnostics | null>(null);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{kind: 'success' | 'error'; text: string} | null>(null);
  useStatus('Settings.about.export', result ? {...result, onDismiss: () => setResult(null)} : null);

  useEffect(() => {
    let cancelled = false;
    getRuntimeDiagnostics().then(d => {
      if (!cancelled) {setDiag(d);}
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const releaseTabs: MiniTabDef<string>[] = useMemo(
    () => CHANGELOG.map(r => ({key: r.version, label: r.version === 'Unreleased' ? 'Unreleased' : r.version})),
    [],
  );
  const [selectedVersion, setSelectedVersion] = useState<string>(CHANGELOG[0]?.version ?? '');
  const selected = CHANGELOG.find(r => r.version === selectedVersion) ?? CHANGELOG[0];

  const handleExport = async () => {
    setResult(null);
    setExporting(true);
    try {
      const settings: GtdParaSettings = await loadSettings();
      const path = await exportDebugBundle(settings);
      const name = path.slice(path.lastIndexOf('/') + 1);
      setResult({kind: 'success', text: `Saved ${shortFolder(DEBUG_LOG_FOLDER_PATH)}/${name} - check it before sharing.`});
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError('AboutTab: export debug bundle failed', message);
      setResult({kind: 'error', text: `Export failed: ${message}`});
    } finally {
      setExporting(false);
    }
  };

  const device = diag ? [diag.manufacturer, diag.model].filter(Boolean).join(' ') : '';
  const builtDate = b.builtAt.slice(0, 10);

  return (
    <View style={styles.row}>
      <View style={[styles.column, styles.columnLeft]}>
        <Text style={[styles.title, {color: textColor}]}>gtdpara {b.version}</Text>
        <Text style={[styles.line, {color: textColor}]}>
          build {b.versionCode || 'dev'} · {builtDate}
        </Text>
        <Text style={[styles.line, {color: textColor}]}>
          commit {b.commit}
          {b.release ? '' : b.dirty ? ' · development build, uncommitted changes' : ' · development build'}
        </Text>
        {device !== '' && (
          <Text style={[styles.line, {color: textColor}]}>
            {device}
            {diag?.display ? ` · ${diag.display}` : ''}
          </Text>
        )}
        <Text style={[styles.line, styles.muted, {color: textColor}]}>{PROJECT_URL}</Text>

        <View style={[styles.hr, {backgroundColor: borderColor}]} />

        <Text style={[styles.heading, {color: textColor}]}>Reporting a problem</Text>
        <View style={styles.field}>
          <Pressable onPress={onToggleDebugLogging} hitSlop={8} style={styles.button}>
            <Text style={[styles.buttonText, {color: textColor}]}>
              Debug logging: {debugLogging ? 'ON (tap to turn off)' : 'OFF (tap to turn on)'}
            </Text>
          </Pressable>
          <Text style={[styles.hint, {color: textColor}]}>
            Also writes every log line to {shortFolder(DEBUG_LOG_FOLDER_PATH)}/{LOG_FILE_NAME}, so it survives a crash. Turn on,
            reproduce the problem, then export.
          </Text>
        </View>
        <View style={styles.field}>
          <View style={styles.inline}>
            <PillButton
              label="Export debug bundle"
              primary
              disabled={exporting}
              onPress={handleExport}
              textColor={textColor}
              borderColor={borderColor}
            />
            {exporting && <ActivityIndicator style={styles.spinner} />}
          </View>
          <Text style={[styles.hint, {color: textColor}]}>
            Saves one text file with version, device, a settings summary (no names), counts and the recent log to{' '}
            {shortFolder(DEBUG_LOG_FOLDER_PATH)}. Passwords, calendar links and e-mail addresses are removed; file paths stay,
            so please look through it before attaching it to a GitHub issue.
          </Text>
        </View>
      </View>

      <View style={[styles.vr, {backgroundColor: borderColor}]} />

      <View style={styles.column}>
        <Text style={[styles.heading, {color: textColor}]}>What's new</Text>
        {selected ? (
          <>
            {releaseTabs.length > 1 && (
              <MiniTabs
                tabs={releaseTabs}
                activeKey={selected.version}
                onChange={setSelectedVersion}
                textColor={textColor}
                borderColor={borderColor}
              />
            )}
            <MarkdownPager
              markdown={selected.markdown}
              header={selected.version === 'Unreleased' ? 'Not yet released' : `${selected.version}${selected.date ? ` · ${selected.date}` : ''}`}
              resetKey={selected.version}
              emptyHint="No notes for this version."
              textColor={textColor}
              borderColor={borderColor}
            />
          </>
        ) : (
          <Text style={[styles.hint, {color: textColor}]}>No release notes in this build.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', flex: 1},
  column: {flex: 1},
  columnLeft: {marginRight: SPACING.base},
  vr: {width: 1, marginRight: SPACING.base},
  hr: {height: 1, marginVertical: SPACING.md},
  title: {fontSize: FONT.large, fontWeight: '700', marginBottom: SPACING.xs},
  heading: {fontSize: FONT.medium, fontWeight: '700', marginBottom: SPACING.sm},
  line: {fontSize: FONT.small, marginBottom: 2},
  muted: {opacity: 0.6},
  field: {marginBottom: 18},
  inline: {flexDirection: 'row', alignItems: 'center'},
  button: {alignSelf: 'flex-start'},
  buttonText: {fontSize: FONT.small, fontWeight: '600', textDecorationLine: 'underline'},
  hint: {fontSize: FONT.small, opacity: 0.6, marginTop: 4},
  spinner: {marginLeft: SPACING.sm},
});
