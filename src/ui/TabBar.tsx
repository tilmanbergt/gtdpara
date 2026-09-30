/**
 * Shared top chrome for the tab-based navigation (App.tsx): eight persistent
 * tabs - Projects, Areas, Daily, Week, Inbox, Current, Review, Settings -
 * plus a shared 🔄 refresh icon and a "✕ Close plugin" action, always
 * visible regardless of which tab is active. Replaces the old per-screen
 * header/back-button pattern (Home/DailyView/ItemDetail/Settings each used
 * to render their own "‹ Back" + "✕", and most of them their own refresh
 * button too): switching tabs is now the only navigation, there is no back
 * stack, and there is now exactly one refresh affordance rather than one
 * per screen.
 *
 * Week (2026-09-13, docs/dev/technical-design-weekly-view.md §9) sits right
 * after Daily - both are calendar-scoped "what's coming up" tabs (Daily for
 * today, Week for the current Monday..Sunday), so grouping them adjacently
 * reads naturally; Inbox stays right after, same relative order as before.
 *
 * Inbox (2026-09-03, docs/dev/technical-design-inbox-tab.md §2) sits right
 * after Daily - both are "flow" tabs (where captured/triaged work lands and
 * gets acted on day-to-day), grouped ahead of the more structural
 * Current/Review/Settings tabs, same placement reasoning
 * technical-design-daily-compact-ui.md §5.4 worked through before this
 * document superseded that section.
 *
 * Review sits just left of Settings (2026-09-02, screens/ReviewScreen.tsx) -
 * a small "●" badge appears on it when `reviewOverdue` is true (App.tsx
 * derives this from domain/reviewSteps.ts's isReviewOverdue against the
 * loaded settings' per-step review records - true when any step's last
 * review is more than a week old). Deliberately passive: no active
 * reminder/notification, just this badge, per the feature's own design
 * decision.
 *
 * Shared refresh (2026-09-03 Daily-cleanup pass, technical-design-daily-
 * compact-ui.md §1). `onRefresh` means "refresh whatever the active tab is
 * showing" - App.tsx wires it to whichever screen most recently registered
 * a RefreshHandle via the screen's own onRegisterRefresh prop (callback-prop
 * registration, not a ref/imperative-handle - see the design doc's §1.1 for
 * why: it's the same "parent reacts to what a child does" shape every other
 * parent/child data flow in this codebase already uses, and it composes for
 * free with App.tsx genuinely unmounting a tab's screen when it's not
 * active - the registration effect's own cleanup fires on tab-switch-away,
 * no tab-change-specific wiring needed here at all). The icon itself is
 * only rendered when `onRefresh` is defined - every screen registers one
 * now (2026-09-18: Settings joined the rest once the Templates tab made it
 * complex enough to sometimes need a manual nudge itself), so in practice
 * the icon is always present, but the `undefined` case stays supported
 * rather than assumed away, same defensive posture as every other optional
 * prop in this file. Shows a small spinner in its place while `refreshing`.
 *
 * "?" (2026-09-30, docs/dev/technical-design-in-app-help.md): opens the
 * in-app help as an overlay over the body; while it's open the "?" carries
 * the active underline instead of the current tab.
 *
 * 2026-09-30 (docs/dev/technical-design-render-perf-ab.md §3 B1): the handle and
 * the refreshing flag no longer arrive as props from App.tsx state - they
 * live in ui/refreshStore.ts and this component subscribes itself, so a
 * screen registering its handle re-renders only TabBar, not the whole app.
 */
import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {COLORS, FONT, useThemeColors} from './theme';
import {usePerfRender} from '../utils/perf';
import {runRefresh, useRefreshState} from './refreshStore';

export type AppTab = 'projects' | 'areas' | 'daily' | 'week' | 'month' | 'inbox' | 'current' | 'review' | 'settings';

/** What a refreshable screen registers with App.tsx via its own onRegisterRefresh prop - see the module doc comment's "Shared refresh" note. */
export interface RefreshHandle {
  run: () => void;
}

const TABS: Array<{key: AppTab; label: string}> = [
  {key: 'projects', label: 'Projects'},
  {key: 'areas', label: 'Areas'},
  {key: 'daily', label: 'Daily'},
  {key: 'week', label: 'Week'},
  {key: 'month', label: 'Month'},
  {key: 'inbox', label: 'Inbox'},
  {key: 'current', label: 'Current'},
  {key: 'review', label: 'Review'},
  {key: 'settings', label: 'Settings'},
];

interface Props {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onClose: () => void;
  /** Shows a small "●" badge on the Review tab - see the module doc comment. */
  reviewOverdue?: boolean;
  /**
   * Set while a profile other than the default is active
   * (docs/dev/technical-design-profiles-demo-space.md §3.6): shown as a small
   * bordered label left of 🔄/✕, so demo data is never mistaken for real data.
   * Tapping it opens Settings → Advanced.
   */
  profileLabel?: string | null;
  onProfilePress?: () => void;
  /** In-app help (docs/dev/technical-design-in-app-help.md §3.3): "?" toggles it; drawn active while open. */
  helpOpen?: boolean;
  onHelpPress?: () => void;
}

export default function TabBar({
  activeTab,
  onSelectTab,
  onClose,
  reviewOverdue,
  profileLabel,
  onProfilePress,
  helpOpen,
  onHelpPress,
}: Props): React.JSX.Element {
  usePerfRender('TabBar');
  // Undefined only for the brief instant between tab-switch unmount/remount.
  const {hasRefresh, refreshing} = useRefreshState();
  const onRefresh = hasRefresh ? runRefresh : undefined;
  const {isDarkMode, textColor, borderColor} = useThemeColors();

  return (
    <View style={[styles.container, {borderColor}]}>
      <View style={styles.tabs}>
        {TABS.map(tab => {
          const active = tab.key === activeTab && !helpOpen;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelectTab(tab.key)}
              hitSlop={8}
              style={[styles.tabButton, active && {borderBottomColor: COLORS.accent}]}>
              <Text
                style={[
                  styles.tabText,
                  {color: textColor},
                  active && styles.tabTextActive,
                ]}>
                {tab.label}
                {tab.key === 'review' && reviewOverdue ? (
                  <Text style={[styles.badge, {color: textColor}]}> ●</Text>
                ) : null}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {onHelpPress ? (
        <Pressable
          onPress={onHelpPress}
          hitSlop={8}
          style={[styles.tabButton, styles.helpButton, helpOpen && {borderBottomColor: COLORS.accent}]}>
          <Text style={[styles.tabText, {color: textColor}, helpOpen && styles.tabTextActive]}>?</Text>
        </Pressable>
      ) : null}
      {profileLabel ? (
        <Pressable onPress={onProfilePress} hitSlop={8} style={[styles.profileMarker, {borderColor: textColor}]}>
          <Text style={[styles.profileMarkerText, {color: textColor}]} numberOfLines={1}>
            {profileLabel}
          </Text>
        </Pressable>
      ) : null}
      {onRefresh && (
        <Pressable style={styles.refreshButton} onPress={onRefresh} disabled={refreshing} hitSlop={8}>
          {refreshing ? (
            <ActivityIndicator size="small" color={textColor} />
          ) : (
            <Text style={[styles.refreshText, {color: textColor}]}>🔄</Text>
          )}
        </Pressable>
      )}
      <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
        <Text style={[styles.closeText, {color: textColor}]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Was 40/8. The space above the tabs was unused (the device has no
    // system status bar); it now pays for the central status slot right
    // below (docs/dev/technical-design-status-slot.md D7).
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  tabs: {
    flexDirection: 'row',
    flex: 1,
  },
  tabButton: {
    paddingVertical: 4,
    marginRight: 18,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  badge: {
    fontSize: FONT.medium,
  },
  profileMarker: {
    borderWidth: 1.5,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 6,
    maxWidth: 140,
  },
  profileMarkerText: {
    fontSize: FONT.small,
    fontWeight: '700',
  },
  helpButton: {
    minWidth: 28,
    alignItems: 'center',
    marginRight: 10,
  },
  refreshButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 28,
    alignItems: 'center',
  },
  refreshText: {
    fontSize: FONT.medium,
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 4,
  },
  closeText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
});
