/**
 * Review step "Focus reset": choose this week's and this month's focus.
 * A Week | Month mini-tab switches between the two; each shows the same
 * focus panel as the Week and Month tabs (ui/PeriodFocusPanel.tsx: focused
 * items with their goal, empty slots to arm and pick from Projects/Areas).
 */
import React, {useMemo, useState} from 'react';
import {Text, View} from 'react-native';
import {periodOf, PeriodScope} from '../../../domain/period';
import {CachedItem} from '../../../storage/dataCache';
import {buildPeriodFocusCards} from '../../../storage/periodFocusCards';
import {saveItemGoal} from '../../../storage/periodGoals';
import {common} from '../../../ui/commonStyles';
import MiniTabs, {MiniTabDef} from '../../../ui/MiniTabs';
import PeriodFocusPanel from '../../../ui/PeriodFocusPanel';
import {useStableCallback} from '../../../ui/useStableCallback';
import {log} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import {styles} from '../reviewStyles';
import {ReviewStepProps, togglePeriodFocus} from '../shared';

const TABS: MiniTabDef<PeriodScope>[] = [
  {key: 'weekly', label: 'Week'},
  {key: 'monthly', label: 'Month'},
];

export default function FocusResetStep({data, onOpenItem, textColor, borderColor, placeholderColor}: ReviewStepProps): React.JSX.Element {
  const {items, settings, paths, refreshFromCache} = data;
  const [scope, setScope] = useState<PeriodScope>('weekly');
  const period = useMemo(() => periodOf(scope, new Date()), [scope]);
  const focusCards = useMemo(() => buildPeriodFocusCards(items, period), [items, period]);

  const onToggle = useStableCallback((item: CachedItem, value: boolean) => togglePeriodFocus(data, item, scope, value));
  const onSaveGoal = useStableCallback(async (item: CachedItem, key: string, text: string) => {
    await saveItemGoal(item, scope, key, text);
    log('ReviewScreen: goal saved', scope, key, item.path);
    refreshFromCache();
    requestEinkRefresh();
  });
  const openItem = useStableCallback((kind: 'project' | 'area', entry: {name: string; path: string}) =>
    onOpenItem({kind, name: entry.name, path: entry.path}),
  );

  return (
    <View style={styles.stackedColumn}>
      <Text style={[common.hint, {color: textColor}]}>Choose which Projects and Areas get your attention this week and this month.</Text>
      <MiniTabs tabs={TABS} activeKey={scope} onChange={setScope} textColor={textColor} borderColor={borderColor} />
      {paths && (
        <PeriodFocusPanel
          key={scope}
          scope={scope}
          items={items}
          projectsPath={paths.projects}
          areasPath={paths.areas}
          projectLimit={(scope === 'monthly' ? settings?.monthlyFocusProjectCount : settings?.weeklyFocusProjectCount) ?? 0}
          areaLimit={(scope === 'monthly' ? settings?.monthlyFocusAreaCount : settings?.weeklyFocusAreaCount) ?? 0}
          focusCards={focusCards}
          periodKey={period.key}
          onOpenItem={openItem}
          onToggle={onToggle}
          onSaveGoal={onSaveGoal}
          textColor={textColor}
          borderColor={borderColor}
          placeholderColor={placeholderColor}
        />
      )}
    </View>
  );
}
