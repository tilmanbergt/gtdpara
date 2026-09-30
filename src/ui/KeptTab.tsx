/**
 * One tab's screen, kept mounted while hidden (docs/dev/technical-design-keep-
 * tabs-alive.md §3.2). Hidden = `display: 'none'`: no layout, nothing drawn,
 * but the JS state and the native views survive, so showing it again needs
 * no rebuild. Provides ScreenActivityContext so the screen's own hooks
 * (ui/screenActivity.ts) know whether they are visible.
 *
 * Memoized: re-renders only when `active` or `children` change. App.tsx
 * builds the children elements with useMemo, so a hidden screen is not
 * re-rendered just because App re-rendered on a tab tap.
 */
import React, {useEffect, useLayoutEffect, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import {createScreenActivity, ScreenActivityContext} from './screenActivity';
import {perfMark} from '../utils/perf';

interface Props {
  tab: string;
  active: boolean;
  children: React.ReactNode;
}

function KeptTab({tab, active, children}: Props): React.JSX.Element {
  // One activity store per kept tab, stable for its lifetime - a change is
  // pushed to subscribers, the screen itself does not re-render for it.
  const activityRef = useRef<ReturnType<typeof createScreenActivity> | null>(null);
  if (!activityRef.current) activityRef.current = createScreenActivity(active);
  const activity = activityRef.current;
  useLayoutEffect(() => {
    activity.set(active);
  }, [activity, active]);
  const firstRef = useRef(true);
  useEffect(() => {
    if (active) perfMark('tab:shown', {tab, kept: true, firstVisit: firstRef.current});
    firstRef.current = false;
  }, [active, tab]);
  return (
    <View style={active ? styles.active : styles.hidden}>
      <ScreenActivityContext.Provider value={activity}>{children}</ScreenActivityContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  active: {flex: 1},
  hidden: {display: 'none'},
});

export default React.memo(KeptTab);
