/**
 * Mounted once (App.tsx): while the stored settings could not be read, says
 * so in the status slot and offers to start over with the defaults
 * (storage/settingsStorage.ts, docs/dev/history/technical-design-quality-hardening.md
 * §3.3). Until then gtdpara runs on defaults and saves no settings, so the
 * stored ones stay as they are for a later build or a bug report.
 */
import {useSyncExternalStore} from 'react';
import {GtdParaSettings} from '../domain/settings';
import {resetSettingsToDefaults} from '../storage/settingsStorage';
import {getSettingsUnreadable, subscribeSettingsUnreadable} from '../storage/settingsUnreadable';
import {errorMessage} from '../utils/errorMessage';
import {logError} from '../utils/log';
import {useStatus} from './status/StatusProvider';

export function useSettingsUnreadableNotice(onReset: (settings: GtdParaSettings) => void): void {
  const reason = useSyncExternalStore(subscribeSettingsUnreadable, getSettingsUnreadable);
  useStatus(
    'app.settingsUnreadable',
    reason === null
      ? null
      : {
          kind: 'error',
          scope: 'global',
          text: 'Settings could not be read - Kept GTD uses defaults and saves no settings.',
          detail:
            `Your stored settings could not be read (${reason}). They stay as they are: Kept GTD runs on default ` +
            'settings and saves none, so nothing replaces them. Export a debug bundle (Settings → Advanced) and ' +
            'report it. "Start over" replaces the stored settings with the defaults for good.',
          actions: [
            {
              label: 'Start over',
              onPress: () => {
                resetSettingsToDefaults()
                  .then(onReset)
                  .catch(e => logError('App: resetting settings failed', errorMessage(e)));
              },
            },
          ],
        },
  );
}
