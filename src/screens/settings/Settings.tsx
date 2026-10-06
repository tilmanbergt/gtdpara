/**
 * Settings: one screen with sub-tabs (Folders, Focus, Calendar, Gmail, Tag
 * Rules, Advanced, About). Calendar and Gmail show only while their
 * experimental switch is on.
 *
 * Folders, Focus, Calendar and Gmail edit one shared draft
 * (useSettingsDraft.ts) that only the Save button at the bottom writes.
 * Everything else takes effect at once: Tag Rules saves each rule itself
 * (tagRules/), and the switches on Advanced and About write immediately and
 * update the draft too, so a later Save can't write an old value back.
 *
 * `initialTab` lets another screen land on a tab (e.g. a Google Calendar
 * panel's "Open Calendar Settings"). It is read once: a tab switch away from
 * Settings unmounts it.
 */
import React, {useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {featuresOf} from '../../domain/features';
import {FileFix, fileNameFixConfirmText, fileNameFixDoneText} from '../../domain/fileNameFix';
import {GtdParaSettings} from '../../domain/settings';
import {rebuildCache} from '../../storage/dataCache';
import {applyFileNameFixes} from '../../storage/fileNameFix';
import {runIntegrityCheck} from '../../storage/integrityCheck';
import {loadSettings, patchSettings} from '../../storage/settingsStorage';
import {setFeatures, useFeatures} from '../../ui/featureStore';
import {dropKeptTabs, setKeepTabsAlive} from '../../ui/keepAliveStore';
import MiniTabs, {MiniTabDef} from '../../ui/MiniTabs';
import {useStatus} from '../../ui/status/StatusProvider';
import {useThemeColors} from '../../ui/theme';
import {useStatusConfirm} from '../../ui/useStatusConfirm';
import {errorMessage} from '../../utils/errorMessage';
import {log, logError} from '../../utils/log';
import {setFileLogging} from '../../utils/logSink';
import {perfEnable} from '../../utils/perf';
import AboutTab from './AboutTab';
import AdvancedTab from './AdvancedTab';
import {CalendarTab, FocusTab, FoldersTab, GmailTab} from './DraftTabs';
import {styles} from './settingsStyles';
import TagRulesTab from './tagRules/TagRulesTab';
import {useMyStylePngs} from './tagRules/useMyStylePngs';
import {useTagRuleDraft} from './tagRules/useTagRuleDraft';
import {useSettingsDraft} from './useSettingsDraft';

export type SettingsTab = 'folders' | 'focus' | 'calendar' | 'gmail' | 'templates' | 'advanced' | 'about';
const SETTINGS_TABS: MiniTabDef<SettingsTab>[] = [
  {key: 'folders', label: 'Folders'},
  {key: 'focus', label: 'Focus'},
  {key: 'calendar', label: 'Calendar'},
  {key: 'gmail', label: 'Gmail'},
  {key: 'templates', label: 'Tag Rules'},
  {key: 'advanced', label: 'Advanced'},
  {key: 'about', label: 'About'},
];

/** Tabs whose edits wait for the Save button. */
const DRAFT_TABS: SettingsTab[] = ['folders', 'focus', 'calendar', 'gmail'];

type Result = {kind: 'success' | 'warning' | 'error'; text: string};

interface Props {
  /** Which sub-tab to land on when this screen mounts (read once). */
  initialTab?: SettingsTab;
  /** Switches the active profile (App.tsx resets and remounts the app) - docs/dev/technical-design-profiles-demo-space.md. */
  onSwitchProfile?: (id: string) => Promise<void>;
}

export default function Settings({initialTab, onSwitchProfile}: Props): React.JSX.Element {
  const {isDarkMode, textColor, placeholderColor} = useThemeColors();
  // Settings keeps its own, slightly lighter border shade.
  const borderColor = isDarkMode ? '#444444' : '#cccccc';

  const [activeTabState, setActiveTab] = useState<SettingsTab>(initialTab ?? 'folders');
  const features = useFeatures();
  const settingsTabs = SETTINGS_TABS.filter(t => (t.key !== 'calendar' || features.googleCalendar) && (t.key !== 'gmail' || features.gmail));
  // A remembered tab that was just hidden falls back to Folders.
  const activeTab: SettingsTab = settingsTabs.some(t => t.key === activeTabState) ? activeTabState : 'folders';

  const draft = useSettingsDraft();
  const {values, setValues, setSaveError} = draft;
  const tagRules = useTagRuleDraft(values, setValues);
  const myStyle = useMyStylePngs();

  // Integrity Check and Fix file names (Advanced) - result and its action in the status slot.
  const [integrityCheckRunning, setIntegrityCheckRunning] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<Result | null>(null);
  const [fileNameFixes, setFileNameFixes] = useState<FileFix[]>([]);
  const confirmFileNameFix = useStatusConfirm('Settings.fileNameFix');
  // "Reload all files" (Advanced).
  const [reloading, setReloading] = useState(false);
  const [reloadResult, setReloadResult] = useState<{kind: 'success' | 'error'; text: string} | null>(null);
  useStatus('Settings.reload', reloadResult ? {...reloadResult, onDismiss: () => setReloadResult(null)} : null);

  const handleFixFileNames = async () => {
    const fixes = fileNameFixes;
    if (fixes.length === 0 || !(await confirmFileNameFix(fileNameFixConfirmText(fixes)))) return;
    setIntegrityResult(null);
    setFileNameFixes([]);
    setIntegrityCheckRunning(true);
    try {
      const result = await applyFileNameFixes(fixes);
      setIntegrityResult({
        kind: result.failed.length > 0 ? 'warning' : 'success',
        text: fileNameFixDoneText(result.renamed, result.linksUpdated, result.failed.length),
      });
    } catch (e) {
      setIntegrityResult({kind: 'error', text: `Fix file names failed: ${errorMessage(e)}`});
    } finally {
      setIntegrityCheckRunning(false);
    }
  };
  useStatus(
    'Settings.integrity',
    integrityResult
      ? {
          ...integrityResult,
          actions:
            fileNameFixes.length > 0
              ? [
                  {
                    label: `Fix file names (${fileNameFixes.length})`,
                    primary: true,
                    onPress: () => {
                      handleFixFileNames();
                    },
                  },
                ]
              : undefined,
          onDismiss: () => setIntegrityResult(null),
        }
      : null,
  );

  /** Runs against the current, possibly unsaved folder settings - the check only reads. */
  const handleRunIntegrityCheck = async () => {
    setIntegrityResult(null);
    setFileNameFixes([]);
    setIntegrityCheckRunning(true);
    try {
      const summary = await runIntegrityCheck(values);
      setFileNameFixes(summary.fileNameFixes);
      setIntegrityResult(
        summary.findings.length === 0
          ? {kind: 'success', text: `Integrity Check: no issues found (${summary.itemsScanned} items scanned) - report saved as ${summary.reportFileName} in EXPORT/gtdpara/debug.`}
          : {
              kind: 'warning',
              text: `Integrity Check: ${summary.findings.length} issue(s) in ${summary.itemsScanned} items - see ${summary.reportFileName} in EXPORT/gtdpara/debug.`,
            },
      );
    } catch (e) {
      setIntegrityResult({kind: 'error', text: `Integrity Check failed: ${errorMessage(e)}`});
    } finally {
      setIntegrityCheckRunning(false);
    }
  };

  /**
   * Re-reads every Project/Area from its file (with the saved settings),
   * drops the kept tabs so each loads again on its next visit, and lists the
   * MyStyle backgrounds again. Unsaved edits on the other tabs stay.
   */
  const handleReloadAllFiles = async () => {
    setReloadResult(null);
    setReloading(true);
    try {
      log('Settings: reload all files - start');
      const cache = await rebuildCache(await loadSettings());
      dropKeptTabs();
      myStyle.reload();
      log('Settings: reload all files - done', cache.items.length);
      setReloadResult({kind: 'success', text: `Reloaded ${cache.items.length} projects and areas from the files.`});
    } catch (e) {
      const message = errorMessage(e);
      logError('Settings: reload all files failed', message);
      setReloadResult({kind: 'error', text: `Reload failed: ${message}`});
    } finally {
      setReloading(false);
    }
  };

  /** A switch that takes effect at once: applied, stored, and mirrored into the draft. */
  const toggleNow = async (key: keyof GtdParaSettings & ('perfTracing' | 'keepTabsAlive' | 'debugLogging' | 'experimentalGoogleCalendar' | 'experimentalGmail')) => {
    const next = !values[key];
    const nextValues = {...values, [key]: next};
    setValues(v => ({...v, [key]: next}));
    if (key === 'perfTracing') perfEnable(next);
    if (key === 'keepTabsAlive') setKeepTabsAlive(next);
    if (key === 'debugLogging') setFileLogging(next);
    if (key === 'experimentalGoogleCalendar' || key === 'experimentalGmail') setFeatures(featuresOf(nextValues));
    try {
      await patchSettings({[key]: next});
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  };

  if (draft.loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={styles.spacer} />
      </View>
    );
  }

  const tabProps = {textColor, borderColor, placeholderColor};
  return (
    <View style={[styles.container, styles.background]}>
      <View style={styles.content}>
        <MiniTabs tabs={settingsTabs} activeKey={activeTab} onChange={setActiveTab} textColor={textColor} borderColor={borderColor} />

        <View style={styles.tabBody}>
          {activeTab === 'folders' && <FoldersTab draft={draft} {...tabProps} />}
          {activeTab === 'focus' && <FocusTab draft={draft} {...tabProps} />}
          {activeTab === 'calendar' && <CalendarTab draft={draft} {...tabProps} />}
          {activeTab === 'gmail' && <GmailTab draft={draft} {...tabProps} />}
          {activeTab === 'templates' && <TagRulesTab draft={tagRules} tagRules={values.tagRules} myStyle={myStyle} {...tabProps} />}
          {activeTab === 'advanced' && (
            <AdvancedTab
              activeProfileId={values.activeProfileId}
              onSwitchProfile={onSwitchProfile}
              experimentalGoogleCalendar={values.experimentalGoogleCalendar}
              experimentalGmail={values.experimentalGmail}
              perfTracing={values.perfTracing}
              keepTabsAlive={values.keepTabsAlive}
              integrityCheckRunning={integrityCheckRunning}
              reloading={reloading}
              onReloadAllFiles={handleReloadAllFiles}
              onToggleGoogleCalendar={() => toggleNow('experimentalGoogleCalendar')}
              onToggleGmail={() => toggleNow('experimentalGmail')}
              onTogglePerfTracing={() => toggleNow('perfTracing')}
              onToggleKeepTabsAlive={() => toggleNow('keepTabsAlive')}
              onRunIntegrityCheck={handleRunIntegrityCheck}
              textColor={textColor}
              borderColor={borderColor}
            />
          )}
          {activeTab === 'about' && (
            <AboutTab debugLogging={values.debugLogging} onToggleDebugLogging={() => toggleNow('debugLogging')} textColor={textColor} borderColor={borderColor} />
          )}
        </View>

        {DRAFT_TABS.includes(activeTab) && (
          <>
            <Pressable style={styles.saveButton} onPress={draft.handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                draft.handleResetDefaults();
                tagRules.handleCancelDefinitionEdit();
              }}
              style={styles.resetButton}>
              <Text style={[styles.resetText, {color: textColor}]}>Reset to defaults</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
