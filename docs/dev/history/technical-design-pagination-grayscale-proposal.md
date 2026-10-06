# Proposal: pagination budget increases + grayscale accent

Concrete, numbered proposals for two independent changes. Neither has been
applied to code yet — this is the technical-design step before
implementation, per the project's own workflow. See
`docs/dev/design-device-rendering.md` for the underlying element/row-height
budget these numbers are derived from.

## 0. Correction note (2026-09-14, superseding an earlier draft of this doc)

An earlier draft of this section claimed the prior style-cleanup rollout
(centralizing every `'#2f6feb'` accent literal into `COLORS.accent`) had
silently reverted, based on a grep of 13 files that looked un-migrated. That
finding was wrong. The files grepped were locally-staged copies cached
earlier in the session, from before the rollout's commit had landed on the
device — not a device-side revert. A fresh re-stage of every flagged file
(confirmed by matching device mtimes against an independent check) followed
by a fresh grep found the rollout fully intact: every site listed in §2.3
below already reads `COLORS.accent`/`COLORS.accentText` from `./theme`, with
zero raw `'#2f6feb'` or local `ACCENT` literals remaining anywhere outside
`theme.ts` itself. `feature_style_cleanup.md` (project memory) has been
corrected accordingly. The lesson — re-stage before trusting a "fresh" grep
mid-session, since other work can land on the device between two staging
calls — is now recorded there too.

Because the rollout is already complete and correct, §2.3 below is a much
smaller task than the earlier draft implied: it is a straight `theme.ts`
value swap everywhere `COLORS.accent` is used as a fill/border, and a
replacement-cue task only at the handful of sites that use it as a plain
text color.

## 1. Pagination: proposed `PAGE_SIZE` increases

Method: for each flagged list (see `docs/dev/design-device-rendering.md` §4/§6),
walk its column's fixed costs (chrome, headings, mini-tabs, the quick-add
card, other sections sharing the column) using the row-height budget in
that doc, to estimate how much vertical slack is actually available. Then
propose using well under half of that estimated slack — the estimate itself
carries real uncertainty (the ~1.2× line-height guess in particular), so
"safe side" here means leaving a large margin for that uncertainty rather
than raising each constant to its theoretical ceiling.

| Constant | File | Current | Proposed | Worst-case added height | Estimated slack before change | Notes |
|---|---|---|---|---|---|---|
| `projectMeetings` | `ui/pagination.ts` | 3 | **6** | +168px (3 more `MeetingRow`s) | ~1080px | Current tab's Meetings section is the *last* element in its column — nothing below it to protect. |
| `projectTodos` | `ui/pagination.ts` | 5 | **8** | +192px (3 more `TaskRow`s) | shared with Meetings above | Sits above Meetings in the same column; combined worst-case with the Meetings increase is ~360px against ~1080px slack — leaves ~700px margin. |
| `inboxTasks` | `ui/pagination.ts` | 5 | **8** | +192px | ~888px | Same shape as `projectTodos` (Inbox's Tasks section, above Meetings). |
| `inboxMeetings` | `ui/pagination.ts` | 3 | **6** | +168px | shared with Tasks above | Same shape as `projectMeetings` — last element in its column. Combined worst-case ~360px against ~888px slack. |
| `dailyCalendarMeetings` | `ui/pagination.ts` | 5 | **7** | +112px (2 more rows) | ~968px | Smaller bump deliberately — this column has `DailyFocusPanel` stacked directly below it with its own fixed row budget, so there's less "nothing below it" slack than the other four; kept conservative. |

**Not proposed to change** — already packing tightly against their own
budget in the 2026-09-14 screenshots, no slack observed:
`column` (Daily's Open-tasks, =10), `weeklyDayMeetings` (=3),
`weeklyWeekendMeetings` (=1), `full`/`browse`/`review`/`stacked`/every
`googleCalendar*` constant.

**Recommended next step after applying:** a fresh on-device screenshot of
each of the five changed sections, filled with enough real data to actually
hit the new page size — if there's still a visible gap before the next
section/screen edge, these can go further; if a row starts crowding the
edge, dial back. This proposal is deliberately the *first* safe increment,
not a final tuning.

## 2. Grayscale: repoint `COLORS.accent` to black + fix plain-text uses

### 2.1 `ui/theme.ts` change

```ts
export const COLORS = {
  ...
  accent: '#000000',      // was '#2f6feb'
  accentText: '#ffffff',  // unchanged — white on the new black fill
} as const;
```

**Why black, not a mid-gray:** `COLORS.accent` today is used two different
ways that need two different treatments once color is gone:

1. **As a fill/border** (chip/pill/button backgrounds, active-tab
   underline, editing-row left border) — these want maximum contrast
   against white, so plain black + white text/border is the strongest,
   clearest e-ink treatment. Every one of these sites already reads
   `COLORS.accent`/`COLORS.accentText` from the shared token (verified
   live, §2.3) — the value swap alone is the fix, no call-site change
   needed.
2. **As a plain text color** sitting next to normal black body text (active
   tab label, a "today" heading, a "Paste"/link label) — if accent becomes
   black too, this distinction *disappears*, since it now matches ordinary
   text exactly. These sites need a real replacement, not just a recolor —
   see 2.3.

### 2.2 Add a documented rule, not a new token

`ui/theme.ts`'s `COLORS` doc comment should say plainly: **`COLORS.accent`
is a fill/border color only — never apply it as a plain text `color`.**
Where a color screen would reach for colored text, use `fontWeight: '700'`
and/or `textDecorationLine: 'underline'` instead. No new constant needed —
`ui/TaskBadges.tsx`'s own doc comment already names this pattern
("grayscale-safe by construction") for its glyph badges; this makes it an
explicit rule for text too, so it isn't reinvented differently at each site.

### 2.3 Per-site fixes (verified against live device files, 2026-09-14)

**2.3a — Fill/border sites: value swap only, zero call-site changes needed.**
All of these already read `COLORS.accent`/`COLORS.accentText` from
`./theme`; once 2.1 lands they render solid black fill / white text
automatically.

| Site | Style(s) |
|---|---|
| `ui/TabBar.tsx` | active tab `borderBottomColor` |
| `ui/MiniTabs.tsx` | active tab `borderBottomColor` |
| `ui/TaskRow.tsx` / `ui/MeetingRow.tsx` | `rowEditing.borderLeftColor` (4px); `tagSelected` bg + text |
| `ui/TagChips.tsx` | selected chip `borderColor` + `chipSelected` bg; selected chip text (`accentText`) |
| `ui/FlowStateChips.tsx` | selected chip `borderColor` + `chipSelected` bg |
| `ui/QuickAddWidget.tsx` | chip `borderColor` + `chipSelected` bg + selected chip text (`accentText`); `primaryButton` bg + `primaryButtonText` (`accentText`) |
| `ui/ItemStatusPanel.tsx` | selected option `borderColor` + `statusOptionSelected` bg + selected option text (`accentText`) |
| `ui/GoogleCalendarPanel.tsx` | `copyButton` bg + `copyButtonText` (`accentText`) |
| `ui/ItemsList.tsx` | `createButton` bg |
| `screens/Settings.tsx` | `saveButton` bg + `saveButtonText` (`accentText`) |
| `screens/ReviewScreen.tsx` | `finishButton` bg + `finishButtonText` (`accentText`) |
| `screens/DailyView.tsx` | `dayToggleButtonActive.borderBottomColor`; `contextPillActive` bg (its text, `contextPillActiveText`, is a separate raw `'#ffffff'` literal — already grayscale-safe as-is, but worth pointing at `COLORS.accentText` too for consistency, not required for this proposal) |

**2.3b — Plain-text sites: need a color-independent replacement.**

| Site | Current | Existing backup cue? | Proposed replacement |
|---|---|---|---|
| `ui/TabBar.tsx` — active tab label | `color: active ? COLORS.accent : textColor` | Yes — `tabTextActive: {fontWeight: '700'}` vs base `'600'` | Drop the color line entirely; the weight difference alone already carries it. |
| `ui/MiniTabs.tsx` — active tab label | same pattern | Yes — `textActive: {fontWeight: '600'}` vs base (no weight set) | Drop color only. |
| `screens/DailyView.tsx` — `dayToggleText` (Today/Tomorrow, ×2 sites) | `color: ... ? COLORS.accent : textColor` | Yes — `dayToggleTextActive: {fontWeight: '700'}` | Drop color only. |
| `ui/QuickAddWidget.tsx` — `tabText` (Task/Meeting toggle, ×2 sites) | same pattern | Yes — `tabTextActive: {textDecorationLine: 'underline'}` | Drop color only — underline already fully carries it. |
| `ui/TaskRow.tsx` / `ui/MeetingRow.tsx` — inline `#tag` (`tag` style) | `color: COLORS.accent, fontWeight: '600', textDecorationLine: 'underline'` | Yes — underline already present | Drop color only. Zero information lost. |
| `ui/GoogleCalendarPanel.tsx` — `check` (✓ marking an already-added event) | `color: COLORS.accent` | Yes — the ✓ glyph itself only appears when relevant | Drop color, no replacement needed. |
| `ui/GoogleCalendarPanel.tsx` — `link` (3 usage sites: "Open Calendar Settings" and two others) | `color: COLORS.accent, fontWeight: '600'` | No — plain body text is not bold, so weight alone would be a real (if subtle) cue, but nothing marks it as *tappable* | Drop color, add `textDecorationLine: 'underline'` — matches the `#tag` link-affordance pattern above. |
| `screens/Settings.tsx` — `pasteButtonText` | `color: COLORS.accent, fontWeight: '600'` | No, same reasoning as GCP `link` | Drop color, add underline. |
| `ui/WeeklyMeetingsColumn.tsx` — `dayHeadingToday` | `color: COLORS.accent` only, layered on an **already-bold** `dayHeading` base (all seven day headings are `fontWeight: '700'`) | No — bold is shared by every day, not just today | Drop color, add `textDecorationLine: 'underline'` — the only sites this heading needs to read differently from the other six. |

**2.3c — Other raw color literals found along the way (not `COLORS.accent`,
but in scope for "remove any color usage"):**

| Site | Current | Notes | Proposed replacement |
|---|---|---|---|
| `ui/TabBar.tsx` — Review-overdue `●` badge | `color: '#d9534f'` (red), no glyph/weight backup | The dot's presence/absence is already the entire signal — reviewOverdue is boolean, the badge either renders or doesn't. | Drop color → `textColor`. Nothing lost. |
| `ui/GoogleCalendarPanel.tsx` / `screens/Settings.tsx` — `errorText` (`#c0392b`, two independent local style copies) | red text | Both call sites already prefix the message with `⚠ ` (confirmed live) | Drop color entirely — the `⚠` glyph already carries the meaning; red wouldn't render as red on this device anyway. |
| `ui/QuickAddWidget.tsx` — `centerTextWarn` (`#a8402f`) | red text, applied on top of `centerText` (opacity 0.7 → 1, `fontWeight: '600'` already present as a backup) | Shows a blocked/validation message inline, no glyph currently | Drop color — bold + full opacity (vs the dimmed default state) already reads as "this one's different." Optionally prefix with `⚠ ` for parity with the two `errorText` sites above, but not required to preserve information. |

### 2.4 Net effect

Once applied: `theme.ts`'s `COLORS.accent`/`accentText` are the only place
a "this is filled/selected/active" visual choice is made, every fill site
already reads it directly (§2.3a — no call-site changes needed there), and
every plain-text accent use gets a color-independent replacement that in
most cases (§2.3b) reuses a distinguishing cue the component already had
(a bold-weight or underline variant sitting unused next to the color).
Only `ui/WeeklyMeetingsColumn.tsx`'s `dayHeadingToday`, `ui/
GoogleCalendarPanel.tsx`'s `link`, and `screens/Settings.tsx`'s
`pasteButtonText` need a genuinely new cue (underline) added. §2.3c's three
sites are a separate, smaller cleanup of non-accent reds, included here
because they were found in the same review and match the same "remove
color, keep the existing glyph/weight as the real signal" approach.

Verification step once implemented: a repo-wide grep for `'#` inside `src/`
should return matches only inside `ui/theme.ts` itself — done via a fresh
device re-stage immediately before grepping, not from locally-cached files
(see §0).

## Changelog

- 2026-09-14 — created. Pagination proposal derived from
  `docs/dev/design-device-rendering.md`'s element/row-height budget; grayscale
  proposal built from a live-file grep.
- 2026-09-14 (later same day) — corrected. An earlier version of this
  document's §0 incorrectly claimed the style-cleanup rollout had reverted,
  based on a grep of stale locally-cached files from earlier in that
  session rather than the live device state. Re-verified live: the rollout
  is complete and correct. §2.3 rewritten from scratch against a fresh,
  confirmed-current grep — split into fill/border sites (value-swap only)
  and plain-text sites (need a replacement cue), plus a new §2.3c covering
  three unrelated raw-red literals found during the same pass.
