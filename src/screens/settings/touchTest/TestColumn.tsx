/**
 * The touch test's test column: sample rows (TestRows.tsx) filling the
 * column down to the screen's bottom edge, watched by an observe-only
 * ui/touchDiag/TouchObserver. The column measures itself: its height decides
 * how many rows fit, its page position places the last touch's marker
 * (touches come in page coordinates).
 */
import React, {useEffect, useRef, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';
import {RawTouch} from '../../../domain/touchDiag';
import TouchObserver from '../../../ui/touchDiag/TouchObserver';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import LastTouchMarker from './LastTouchMarker';
import TestRows, {fillColumn} from './TestRows';

/** The last touch as the column draws it. */
export interface LastHit {
  x: number;
  y: number;
  target: string | null;
  noTarget: boolean;
}

interface Props {
  onTouch: (touch: RawTouch) => void;
  last: LastHit | null;
  textColor: string;
  borderColor: string;
}

export default function TestColumn({onTouch, last, textColor, borderColor}: Props): React.JSX.Element {
  const ref = useRef<View>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [origin, setOrigin] = useState<{x: number; y: number} | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    setHeight(e.nativeEvent.layout.height);
    ref.current?.measure((_x, _y, _w, _h, pageX, pageY) => setOrigin({x: pageX, y: pageY}));
  };

  // The rows appear one render after the column is measured, without a tap of their own.
  const ready = height !== null;
  useEffect(() => {
    if (ready) requestEinkRefresh();
  }, [ready]);

  return (
    <TouchObserver enabled onTouch={onTouch} style={styles.fill}>
      <View ref={ref} style={styles.fill} onLayout={onLayout}>
        <TestRows samples={height ? fillColumn(height) : []} hitTarget={last?.target ?? null} textColor={textColor} borderColor={borderColor} />
        {last && origin && <LastTouchMarker x={last.x - origin.x} y={last.y - origin.y} noTarget={last.noTarget} />}
      </View>
    </TouchObserver>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
});
