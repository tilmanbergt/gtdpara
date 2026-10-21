/**
 * The touch test's "Log touches everywhere" (Settings → Advanced → Touch
 * test): wraps the whole app in a ui/touchDiag/TouchObserver and writes one
 * log line per touch (position in device pixels, band, movement, duration,
 * pointers - no
 * outcome, no text), so taps on the real Daily and Current screens can be
 * checked near the bottom edge.
 *
 * The wrapping View is always there, so switching it on or off never
 * remounts the app; while off (the default after every start) it has no
 * handlers. While the touch test itself is open it logs its own lines and
 * this one stays quiet.
 */
import React from 'react';
import {Dimensions, PixelRatio, StyleSheet} from 'react-native';
import {RawTouch, rawTouchLogLine} from '../../domain/touchDiag';
import {log} from '../../utils/log';
import {useAppWideTouchLog, useTouchTestOpen} from '../../utils/touchDiagStore';
import TouchObserver from './TouchObserver';

function logTouch(touch: RawTouch): void {
  log(rawTouchLogLine(touch, Dimensions.get('window').height, PixelRatio.get()));
}

export default function AppTouchObserver({children}: {children: React.ReactNode}): React.JSX.Element {
  const on = useAppWideTouchLog();
  const testOpen = useTouchTestOpen();
  return (
    <TouchObserver enabled={on && !testOpen} onTouch={logTouch} style={styles.fill}>
      {children}
    </TouchObserver>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
});
