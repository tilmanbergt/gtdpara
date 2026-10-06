/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import { PluginManager } from 'sn-plugin-lib';
import {LASSO_BUTTON_ID, MARK_BUTTON_ID, SIDEBAR_BUTTON_ID} from './src/domain/buttonIds';
import {createMarkFromLasso, outcomeNeedsScreen, setMarkOutcome} from './src/storage/marks';
import {loadSettings} from './src/storage/settingsStorage';
import {log, logError} from './src/utils/log';
import {setFileLogging} from './src/utils/logSink';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: SIDEBAR_BUTTON_ID,
  name: 'gtdpara',
  icon: Image.resolveAssetSource(
    require('./assets/icon.png'),
  ).uri,
  showType: 1,
});

PluginManager.registerButton(2, ['NOTE', 'DOC'], {
  id: LASSO_BUTTON_ID,
  name: 'Capture Todo/Meeting',
  icon: Image.resolveAssetSource(
    require('./assets/icon.png'),
  ).uri,
  editDataTypes: [0, 1, 2, 3, 4],
  showType: 1,
});

// "Mark for later" (docs/dev/history/technical-design-lasso-0.8.md §3.6): one tap in
// the lasso toolbar, no gtdpara screen (showType 0). The listener lives here,
// not in App.tsx, because App may not be mounted at all.
PluginManager.registerButton(2, ['NOTE', 'DOC'], {
  id: MARK_BUTTON_ID,
  name: 'Mark for later',
  icon: Image.resolveAssetSource(
    require('./assets/mark.png'),
  ).uri,
  editDataTypes: [0, 1, 2, 3, 4],
  showType: 0,
});

PluginManager.registerButtonListener({
  onButtonPress: event => {
    if (event?.id !== MARK_BUTTON_ID) {
      return;
    }
    log('index: Mark for later pressed', 'pressEvent=' + String(event?.pressEvent));
    (async () => {
      // App switches Debug logging on after loading the settings; with
      // showType 0 App may never mount, so do it here too.
      try {
        const settings = await loadSettings();
        if (settings.debugLogging) {
          setFileLogging(true);
        }
      } catch (e) {
        // logging setup is best-effort
      }
      const outcome = await createMarkFromLasso();
      if (outcomeNeedsScreen(outcome)) {
        // App shows the small result screen (App.tsx, MarkOutcomeScreen).
        setMarkOutcome(outcome);
        try {
          await PluginManager.showPluginView();
        } catch (e) {
          logError('index: showPluginView failed', e instanceof Error ? e.message : String(e));
        }
      }
    })();
  },
});
