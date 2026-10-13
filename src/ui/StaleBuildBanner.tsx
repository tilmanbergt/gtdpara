/**
 * "gtdpara was updated - restart to load it cleanly" warning
 * (docs/dev/history/technical-design-host-update-crash.md).
 *
 * Renders nothing itself: it publishes a global warning to the central status
 * slot (docs/dev/history/technical-design-status-slot.md §2B), so it never pushes the
 * screen down when it appears. Mounted once, at App level, for every mode.
 *
 * Checks once on mount whether an older gtdpara build is still loaded in the
 * host process (supernote/pluginRuntime.ts). A new install creates a fresh
 * React instance, so a mount-time check covers every install. Renders nothing
 * in the normal case. The slot's Restart button ends the host process; the next tap
 * on the plugin icon starts a fresh one with only the newest build. Settings
 * and files are not touched.
 */
import {useEffect, useState} from 'react';
import {PluginManager} from 'sn-plugin-lib';
import {getRuntimeDiagnostics, restartPluginHost} from '../supernote/pluginRuntime';
import {whenMarkSettled} from '../storage/marks';
import {log} from '../utils/log';
import {useStatus} from './status/StatusProvider';

export default function StaleBuildBanner(): null {
  const [staleBuilds, setStaleBuilds] = useState<string[]>([]);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Not while "Mark for later" saves: the scan would slow the lasso reads.
    whenMarkSettled().then(getRuntimeDiagnostics).then(d => {
      // Evidence for docs/dev/history/technical-design-new-firmware.md D5:
      // build labels only. A "warning shown" line without a later "Restart
      // tapped" means the warning was ignored (it has no dismiss control).
      if (d) log('pluginRuntime: stale builds', `n=${d.staleBuilds.length}`, d.staleBuilds.join(','));
      if (cancelled || !d || d.staleBuilds.length === 0) return;
      log('pluginRuntime: stale-build warning shown', `n=${d.staleBuilds.length}`);
      setStaleBuilds(d.staleBuilds);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRestart = () => {
    log('pluginRuntime: stale-build warning, Restart tapped', `n=${staleBuilds.length}`);
    setRestarting(true);
    // restartPluginHost schedules the kill ~400 ms later; closing the plugin
    // view first lets the NOTE app see a normal close before the host dies
    // (meant to avoid the host's "not updated" dialog; not yet confirmed).
    restartPluginHost(`stale build(s) loaded: ${staleBuilds.join(', ')}`);
    try {
      PluginManager.closePluginView();
    } catch {
      // ignore - the restart happens either way
    }
  };

  useStatus(
    'app.staleBuild',
    staleBuilds.length === 0
      ? null
      : restarting
      ? {kind: 'warning', scope: 'global', text: 'Restarting… wait a few seconds, then tap the gtdpara icon again.'}
      : {
          kind: 'warning',
          scope: 'global',
          text: 'gtdpara was updated, but the old version is still loaded. Restart once to avoid a crash.',
          actions: [{label: 'Restart', primary: true, onPress: onRestart}],
        },
  );

  return null;
}
