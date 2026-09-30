# Technical Design: Shared Style System (Pilot: DailyView + ReviewScreen)

Status: draft, requirements clarified in chat 2026-09-14. Awaiting go-ahead to implement.

## 1. Goals and motivation

Requested cleanup goals: reduce code repetition/increase reuse; centralize styling (colors, spacing, sizes) so individual screens carry less of their own styling and it's easier to retune the whole app at once; trim historic comments while keeping useful implementation context; and, separately, prefer flexible (flex-based) sizing over hardcoded pixel dimensions where it's a trivial swap during this pass — no layout/visual redesign now.

Evidence gathered from the current codebase (`src/screens/DailyView.tsx`, `src/screens/ReviewScreen.tsx`, sampled alongside `TaskRow.tsx`, `Settings.tsx`, `ItemStatusPanel.tsx`):

- `src/ui/theme.ts` today only holds three font sizes (`FONT.large/medium/small`). No shared colors, spacing, or radius constants exist.
- DailyView.tsx and ReviewScreen.tsx each define their own single `StyleSheet.create` block (176 and 212 lines respectively). **12 style objects are byte-identical between the two**: `container`, `content`, `spacer`, `divider`, `hint`, `error`, `retryText`, `subheading`, `rowSource`, `column`, `columnLeft`, `sectionSpacingSmall`.
- Both screens also duplicate, verbatim, a 4-line dark-mode color derivation (`isDarkMode`/`textColor`/`borderColor`/`placeholderColor`, all from raw hex) and a ~9-line loading/error/retry JSX block at the top of their render tree.
- The accent color `#2f6feb` is hardcoded or re-declared as a local `const ACCENT` in at least five files (`DailyView.tsx`, `TaskRow.tsx`, `ItemStatusPanel.tsx`, `Settings.tsx`, `ReviewScreen.tsx`, and per an existing comment also `FlowStateChips.tsx`/`TabBar.tsx`).
- Comments in both files are mostly substantive design-rationale tied to `docs/dev/technical-design-*.md` sections and are worth keeping. One clearly stale exception found: `ReviewScreen.tsx` (~line 324) carries an unconditional diagnostic `log()` call plus a comment explicitly saying "remove once the underlying issue is confirmed fixed" — per project memory (`bugfix_eink_refresh.md`, follow-up 4), that issue **was** confirmed fixed on-device 2026-09-13.

## 2. Scope of this pass (pilot)

Per chat decision, this is a bounded pilot, not a full-codebase pass — both to prove the approach before committing to it everywhere, and because `ReviewScreen.tsx` specifically has a documented history (project memory) of edits silently reverting on commit, so keeping the first pass small and easy to verify matters.

**In scope:**
- Expand `src/ui/theme.ts` with shared color/spacing/radius tokens.
- New `src/ui/commonStyles.ts` (shared `StyleSheet`) and a new small `ui/LoadErrorNotice.tsx` component.
- Migrate `screens/DailyView.tsx` and `screens/ReviewScreen.tsx` to use them.
- Remove the one confirmed-stale diagnostic comment/log in `ReviewScreen.tsx`.

**Explicitly out of scope for this pass** (tracked as the next rollout phase once the pilot is confirmed):
- Every other screen/component: `ProjectDataPanel.tsx`, `InboxScreen.tsx`, `ItemDetail.tsx`, `ItemsList.tsx`, `CaptureScreen.tsx`, `Settings.tsx`, `WeekView.tsx`, `QuickAddWidget.tsx`, and the `ui/` presentational components (`TaskRow`, `MeetingRow`, `ItemStatusPanel`, `FlowStateChips`, `TabBar`, etc.). Their own local `ACCENT` consts / hardcoded hex values are left as-is for now — touching them would widen this from a 2-file pilot into an all-screens pass.
- Any layout/flex/responsiveness rework beyond a trivial swap already available in the two pilot files (per chat: no redesign this pass).
- The already-tracked `WeeklyFocusKindSection` tech-debt item (unrelated).
- Any visual change. This is a structural refactor only — spacing and colors must render identically before and after.

## 3. `theme.ts` expansion

Additive only (existing `FONT` export unchanged):

```ts
export const COLORS = {
  background: '#ffffff',
  textLight: '#000000',
  textDark: '#ffffff',
  borderLight: '#dddddd',
  borderDark: '#333333',
  placeholderLight: '#999999',
  placeholderDark: '#888888',
  accent: '#2f6feb',
  accentText: '#ffffff',
} as const;

export const SPACING = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24,
} as const;

export const RADII = {
  sm: 4, md: 6, pillSm: 12, pillMd: 14, pillLg: 16,
} as const;

export function useThemeColors() {
  const isDarkMode = useColorScheme() === 'dark';
  return {
    isDarkMode,
    textColor: isDarkMode ? COLORS.textDark : COLORS.textLight,
    borderColor: isDarkMode ? COLORS.borderDark : COLORS.borderLight,
    placeholderColor: isDarkMode ? COLORS.placeholderDark : COLORS.placeholderLight,
  };
}
```

Note: three different pill border-radii (12/14/16) exist today across the two files for what look like different pill *sizes*, not an accidental inconsistency — kept as three named constants (`RADII.pillSm/Md/Lg`) rather than collapsed to one, since forcing one value would be a visual change (out of scope). Opacity-based muting (`opacity: 0.6`, `0.5`, `0.7` applied on top of inherited text color) is left as inline literals, not tokenized — it modifies whatever color it's layered on rather than naming a fixed color.

## 4. New `src/ui/commonStyles.ts`

Shared `StyleSheet.create` built from the tokens above, containing exactly the 12 objects found identical in §1 (`container`, `content`, `spacer`, `divider`, `hint`, `error`, `retryText`, `subheading`, `rowSource`, `column`, `columnLeft`, `sectionSpacingSmall`). Each screen imports it (`import {common} from '../ui/commonStyles'`) and references `common.container` etc. in place of its own local copy; each screen's own `StyleSheet.create` keeps only what's actually screen-specific.

## 5. New `src/ui/LoadErrorNotice.tsx`

Extracts the identical ~9-line block both screens render right after `loading && <ActivityIndicator .../>`:

```tsx
<View>
  <Text style={[common.error, {color: textColor}]}>⚠ {error}</Text>
  <Pressable onPress={onRetry} hitSlop={8}>
    <Text style={[common.retryText, {color: textColor}]}>↻ Retry</Text>
  </Pressable>
</View>
```

Props: `{error: string; onRetry: () => void; textColor: string}`. Both screens' `loading && <ActivityIndicator style={common.spacer} />` line stays inline (one line, not worth its own component).

## 6. Comment & dead-code cleanup (conservative, per chat decision)

- Remove the stale unconditional diagnostic log and its ~9-line comment in `ReviewScreen.tsx` (~line 324): `log('ReviewScreen: render pass', 'step', step)` plus the "if this prints step=1 more than once... remove once the underlying issue is confirmed fixed" comment above it. Confirmed resolved per project memory; every *other* `log(...)` call in this file is gated to a real user action or lifecycle event and stays (that's ongoing runtime logging, not historic commentary).
- Every other comment in both files stays. What's there is overwhelmingly cross-file-convention or design-rationale commentary (references to `docs/dev/technical-design-*.md` sections, "same shape as X's own Y" notes) — genuinely useful, matches the "keep implementation-detail context" instruction, and none of it reads as stale.
- If anything else stale turns up while migrating (e.g. a comment describing code that no longer exists after the extraction above), remove it under the same test: dated + describes a now-resolved/removed situation → remove; explains a convention or non-obvious decision → keep.

## 7. Migration mechanics & risk

- `ReviewScreen.tsx` has two documented incidents (project memory, 2026-09-07 and 2026-09-11) of a committed edit silently reverting on this specific file. Standard mitigation applies: after every commit to either pilot file, re-stage from device and diff/checksum before reporting success to Tilman; retry the identical commit once on mismatch.
- Sequencing, new files first (zero behavioral risk), then one screen at a time with a compile check between:
  1. `theme.ts` additions + new `commonStyles.ts` + `LoadErrorNotice.tsx`.
  2. Migrate `DailyView.tsx` → `tsc --noEmit` scratch check → commit → re-stage + diff verify.
  3. Migrate `ReviewScreen.tsx` (plus the comment/log removal from §6) → `tsc --noEmit` scratch check → commit → re-stage + diff verify.
- No `device_bash` available this session, so no on-device smoke test from here (per established project pattern, this needs a manual pass on the device afterward). Since this pass is a pure refactor, the only expected visible difference is *none* — Daily and Review should look pixel-identical; that's the actual acceptance test.

## 8. Deliverable at the end of this pass

A short before/after summary (duplicate lines removed, files touched) plus an explicit ask for Tilman to smoke-test the Daily and Review tabs on-device before authorizing the same treatment for the rest of the app (`ProjectDataPanel.tsx`, `InboxScreen.tsx`, etc., and the shared `ui/` components carrying their own `ACCENT` copies).

This mirrors how past multi-file passes in this project were sequenced — see `docs/dev/technical-design-pagination-edit-reuse.md` §7 for the precedent (shared primitive first, then one screen at a time, verification at each step, explicit device-test checkpoint before continuing).
