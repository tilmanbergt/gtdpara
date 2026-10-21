/**
 * Watches every finger or pen contact inside it without taking part
 * (Settings → Advanced → Touch test). `onTouchStart`/`Move`/`End`/`Cancel`
 * on a View only observe: they never claim the responder, so the children
 * get every touch exactly as before. While `enabled` is false no handler is
 * attached at all.
 *
 * One record per pointer: start and end position (page coordinates, dp),
 * the largest distance from the start, start and end time (Date.now(), the
 * clock the press reports use too), the most pointers down at once, and
 * whether it ended with a lift or a system cancel.
 */
import React, {useRef} from 'react';
import {GestureResponderEvent, StyleProp, View, ViewStyle} from 'react-native';
import {RawTouch} from '../../domain/touchDiag';
import {nextTouchId} from './touchDiagStore';

interface Props {
  enabled: boolean;
  onTouch: (touch: RawTouch) => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

type Live = Omit<RawTouch, 'endAt' | 'cancelled'>;

export default function TouchObserver({enabled, onTouch, style, children}: Props): React.JSX.Element {
  const live = useRef(new Map<string, Live>());

  const start = (e: GestureResponderEvent) => {
    const now = Date.now();
    const pointers = e.nativeEvent.touches.length;
    for (const t of e.nativeEvent.changedTouches) {
      const key = String(t.identifier);
      if (live.current.has(key)) continue;
      live.current.set(key, {id: nextTouchId(), x: t.pageX, y: t.pageY, endX: t.pageX, endY: t.pageY, maxMove: 0, startAt: now, pointers});
    }
    live.current.forEach(l => {
      l.pointers = Math.max(l.pointers, pointers);
    });
  };

  const move = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.touches) {
      const l = live.current.get(String(t.identifier));
      if (!l) continue;
      l.endX = t.pageX;
      l.endY = t.pageY;
      l.maxMove = Math.max(l.maxMove, Math.hypot(t.pageX - l.x, t.pageY - l.y));
    }
  };

  const finish = (e: GestureResponderEvent, cancelled: boolean) => {
    const now = Date.now();
    for (const t of e.nativeEvent.changedTouches) {
      const key = String(t.identifier);
      const l = live.current.get(key);
      if (!l) continue;
      live.current.delete(key);
      const maxMove = Math.max(l.maxMove, Math.hypot(t.pageX - l.x, t.pageY - l.y));
      onTouch({...l, endX: t.pageX, endY: t.pageY, maxMove, endAt: now, cancelled});
    }
  };

  return (
    <View
      style={style}
      onTouchStart={enabled ? start : undefined}
      onTouchMove={enabled ? move : undefined}
      onTouchEnd={enabled ? e => finish(e, false) : undefined}
      onTouchCancel={enabled ? e => finish(e, true) : undefined}>
      {children}
    </View>
  );
}
