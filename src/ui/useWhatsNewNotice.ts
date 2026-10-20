/**
 * The "Updated to x.y.z" notice with its "What's new" button
 * (docs/dev/history/technical-design-about-debug-experimental.md §3.6, P3).
 * Only a tap on "What's new" or ✕ stores lastSeenVersion - not merely
 * showing it - a first start after an update can be short (the user only
 * marks something, or a warning outranks info in the status slot), so the
 * notice must survive to the next start.
 */
import {useState} from 'react';
import {shouldShowWhatsNew} from '../domain/features';
import {GtdParaSettings} from '../domain/settings';
import {BUILD_INFO} from '../generated/buildInfo';
import {patchSettings} from '../storage/settingsStorage';
import {errorMessage} from '../utils/errorMessage';
import {logError} from '../utils/log';
import {useStatus} from './status/StatusProvider';

export function useWhatsNewNotice(
  settings: GtdParaSettings | null,
  onSettingsStored: (settings: GtdParaSettings) => void,
  openAbout: () => void,
): void {
  const [acknowledged, setAcknowledged] = useState(false);
  const acknowledge = () => {
    setAcknowledged(true);
    patchSettings({lastSeenVersion: BUILD_INFO.version})
      .then(onSettingsStored)
      .catch(e => logError('App: storing lastSeenVersion failed', errorMessage(e)));
  };
  const show = settings !== null && !acknowledged && shouldShowWhatsNew(settings.lastSeenVersion, BUILD_INFO);
  useStatus(
    'app.whatsNew',
    show
      ? {
          kind: 'info',
          scope: 'global',
          text: `Updated to gtdpara ${BUILD_INFO.version}.`,
          actions: [
            {
              label: "What's new",
              primary: true,
              onPress: () => {
                acknowledge();
                openAbout();
              },
            },
          ],
          onDismiss: acknowledge,
        }
      : null,
  );
}
