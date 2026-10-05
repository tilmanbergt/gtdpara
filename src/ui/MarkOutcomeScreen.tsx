/**
 * The small screen "Mark for later" opens only when something went wrong
 * (docs/dev/technical-design-lasso-0.8.md §3.6, screen design 1d). Success
 * opens nothing. Shown by App.tsx while storage/marks.ts holds an outcome;
 * OK clears it and closes gtdpara again, back to the note.
 */
import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {MarkOutcome, retryBookmark, setMarkOutcome} from '../storage/marks';
import {logError} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';
import PillButton from './PillButton';
import {FONT, useThemeColors} from './theme';

function texts(outcome: MarkOutcome): {title: string; body: string} {
  switch (outcome.kind) {
    case 'iconMissing':
      return {
        title: 'Mark saved, icon missing',
        body: 'The mark is in your list, but the bookmark could not be placed on this page.',
      };
    case 'empty':
      return {title: 'Nothing to mark', body: 'The lasso had no handwriting or text box in it.'};
    case 'failed':
      return {title: 'Mark not saved', body: outcome.detail};
    default:
      return {title: 'Mark saved', body: ''};
  }
}

export default function MarkOutcomeScreen({outcome}: {outcome: MarkOutcome}): React.JSX.Element {
  const {textColor, borderColor, isDarkMode} = useThemeColors();
  const [busy, setBusy] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const {title, body} = texts(outcome);

  const close = () => {
    setMarkOutcome(null);
    PluginManager.closePluginView().catch(e =>
      logError('MarkOutcomeScreen: closePluginView failed', e instanceof Error ? e.message : String(e)),
    );
  };

  const retry = async () => {
    if (outcome.kind !== 'iconMissing') {return;}
    setBusy(true);
    const placed = await retryBookmark(outcome.id);
    setBusy(false);
    if (placed) {close();}
    else {
      setRetryFailed(true);
      requestEinkRefresh();
    }
  };

  return (
    <View style={[styles.root, {backgroundColor: isDarkMode ? '#000000' : '#ffffff'}]}>
      <View style={[styles.box, {borderColor: textColor}]}>
        <Text style={[styles.title, {color: textColor}]}>{title}</Text>
        {body ? <Text style={[styles.body, {color: textColor}]}>{body}</Text> : null}
        {retryFailed ? (
          <Text style={[styles.body, {color: textColor}]}>Still no icon. The mark stays in your list.</Text>
        ) : null}
        <View style={styles.buttons}>
          {outcome.kind === 'iconMissing' && !retryFailed ? (
            <PillButton
              label={busy ? 'Trying…' : 'Try icon again'}
              onPress={retry}
              disabled={busy}
              primary
              size="large"
              textColor={textColor}
              borderColor={borderColor}
            />
          ) : null}
          <PillButton label="OK" onPress={close} disabled={busy} size="large" textColor={textColor} borderColor={borderColor} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, alignItems: 'center', paddingTop: 320},
  box: {width: 820, borderWidth: 3, padding: 28},
  title: {fontSize: FONT.large, fontWeight: '700', marginBottom: 12},
  body: {fontSize: FONT.medium, marginBottom: 12},
  buttons: {flexDirection: 'row', marginTop: 8},
});
