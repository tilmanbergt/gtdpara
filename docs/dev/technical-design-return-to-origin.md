# Technical Design: Return to Origin (reopening the plugin from a note it opened itself)

Status: **implemented 2026-09-20** (not yet tested on device). Decisions D1-D4 (§9) were settled in chat 2026-09-20; §3-§7 below describe the as-built version - the persisted snapshot / cold-start restore from the first draft was dropped with D3 (memory-only).

## 1. Goals and motivation

Today `App.tsx`'s `reorient()` runs on cold start and on every sidebar-button press and *always* jumps: to the current note's enclosing Project/Area (Current tab), or to Daily. That is right when the user arrived at a note on their own, but wrong when the plugin itself sent them there. Typical case: on Daily, tap a task's linked note, jot something down, press the plugin button again — and land on the Project's Current tab instead of Daily, the screen they were working on.

New rule: **if the note that is open now is the note this plugin last opened itself, the plugin returns to where it opened it from. Otherwise the existing logic applies unchanged** (enclosing Project/Area, else Daily). Rationale: opening a note or doc manually, outside the plugin, already means the user moved on to something else.

Design constraints, same as previous features: build on existing mechanisms, add the least possible persisted state, keep `domain/` pure.

## 2. Behavior

Landing priority inside `reorient()` (first match wins):

| # | Condition | Landing | Status |
|---|---|---|---|
| 0 | Lasso button pressed | Capture overlay (guarded by `routedByLassoButtonRef`) | unchanged |
| 1 | `settings.focusModeActive` | Focus mode | unchanged |
| 2 | **Valid return record** (§3) | **Resume** (§4) | **new** |
| 3 | Current note is inside a Project/Area | Current tab on that item | unchanged |
| 4 | otherwise | Daily | unchanged |

Focus mode stays above the new rule on purpose: its own doc says reopening must *always* land back on it.

Side observation: opening a note that lives inside the Project you are already viewing on the Current tab already "resumes" today, because the jump to the same tab/item is a no-op. The new rule mainly changes every *other* case (Daily, Week, Inbox, Review, another Project).

## 3. The return record

One slot only - "the last note the plugin opened". Written by `openPath` (§6), read by `reorient()`.

```ts
// src/domain/returnContext.ts (pure TS, no RN/SDK imports)
export interface ReturnRecord { path: string /* normalizeNotePath() */; openedAt: number /* Date.now() */ }
export const RETURN_TTL_MS = 12 * 60 * 60 * 1000;
export function normalizeNotePath(p: string): string;  // // -> /, trailing /, /sdcard | /storage/self/primary | /mnt/sdcard -> /storage/emulated/0
export function isRecordValid(record, currentPath, nowMs): boolean; // exists, younger than TTL, normalized paths equal

export type Landing =
  | {kind: 'focus'}
  | {kind: 'resume'; enclosing: EnclosingItem | null}
  | {kind: 'item'; item: EnclosingItem; clearRecord: boolean}
  | {kind: 'daily'; clearRecord: boolean};
export function decideLanding({focusModeActive, currentPath, record, paths, nowMs}): Landing;
```

Lifecycle: **written** on every `openPath` (replacing the previous record); **kept** across resumes (sticky, D1); **cleared** the first time a `reorient()` finds a different note open or the record expired (`clearRecord: true`) - which makes "navigated elsewhere manually" permanent; **rolled back** if `openFile` fails.

## 4. Resume

The Activity/JS instance normally stays alive while the plugin view is only hidden, so all React state is still intact (`activeTab`, `currentItem`, every mounted screen's own state). Resuming therefore means *not navigating* (D2: come back to where it was last left, not to a snapshot taken at open time). `App.tsx`'s resume branch:

- leaves `activeTab` and all screens untouched;
- sets `mode` back to `'tabs'` (it may still be `'capture'` after a Lasso Save & Close);
- **D4:** if the note has an enclosing Project/Area *and the Current tab is not the one on screen* (`activeTabRef`), sets `currentItem` to it, so the Current tab points at the note's item. When Current is on screen it is left alone - swapping what is displayed would defeat the resume.

Memory-only (D3): a freshly started process has no record and no screen state, so it falls through to the normal logic; nothing is persisted, nothing has to be restored, no snapshot/validation code exists.

## 5. Storage: `src/storage/returnRecord.ts`

Module-level variable, same lifetime as `dataCache`. `getReturnRecord()`, `clearReturnRecord()`, and `recordPluginOpen(path): () => void` which returns an undo that restores the previous record only if nothing replaced this one meanwhile.

## 6. Capturing "opened by the plugin": one choke point

All in-plugin opens already go through `supernote/fileSystem.ts`'s `openPath` (FileBrowserPane, ProjectDataPanel, DailyView, WeekView, InboxScreen, ReviewScreen - no call site changed). `fileSystem.ts` must not import from storage/, so it exposes `setOpenPathObserver({onOpening(path) => undo | void})`. `openPath` calls `onOpening` after the read-permission check and **before** `PluginFileAPI.openFile` (once the host opens the file it may hide/freeze the plugin), and calls the returned undo if `openFile` throws or reports failure.

## 7. `App.tsx` changes (as built)

1. `activeTabRef` mirror of `activeTab` (reorient is created once in the mount effect).
2. Mount effect: `setOpenPathObserver({onOpening: path => recordPluginOpen(path)})`; cleanup sets it to `null`.
3. `reorient()`: after the existing `cancelled || routedByLassoButtonRef` guard and `rebuildCache`, one `decideLanding(...)` call replaces the old focus/enclosing/daily block; branches: `focus` (existing code), `resume` (§4), otherwise `clearReturnRecord()` if flagged, then the existing item/daily code. One log line `App: reorient landing <kind> current=<raw> recorded=<normalized>` records both path spellings.

## 8. Edge cases

| # | Case | Decision |
|---|---|---|
| 1 | Plugin process died between open and return | Memory-only (D3): no record survives, normal logic applies (enclosing Project/Area, else Daily). |
| 2 | Button pressed again from the same note after resuming, or after ✕ | Record is sticky → live state kept (D1). |
| 3 | User switches to another note manually, presses button | Mismatch → normal logic **and record cleared**; returning to the old note by hand later no longer resumes. |
| 4 | Path spelling differs between what we passed to `openFile` and what `getCurrentFilePath` returns (`/sdcard/…` vs `/storage/emulated/0/…`, trailing slash) | `normalizeNotePath` on both sides; the landing log line records both raw values. **Must be verified on device** (Supernote's real return format is the one unknown here). |
| 5 | `openFile` fails or throws | Record rolled back to the previous one. |
| 6 | Lasso capture inside the opened note, Save & Close, then sidebar press | `mode` is `'capture'`; resume forces it back to `'tabs'` without touching the tab. |
| 7 | Focus mode active | Focus wins; record untouched. |
| 8 | Note's Project/Area is not valid (note outside Projects/Areas, e.g. Archive/Resources/Inbox) | `findEnclosingItem` returns null → `currentItem` is left as it was. |
| 9 | Very old record (user left the note open for days), or day rollover so a mounted Daily/Week shows stale data | 12 h TTL → treated as invalid. |
| 10 | Plugin opens note A (from Daily), later opens note B (from a Project); user navigates back to A by hand | Single slot: record is B, mismatch → normal logic for A. No per-note history, by design ("last note it opened"). |
| 11 | Note moved/renamed/deleted while away, or `baseRoot` changed in Settings | Path mismatch → normal logic. |
| 12 | Notes the plugin *creates* without opening (`createLinkedNote`, standalone Note quick-add) | Not via `openPath` → no record. Creating alone doesn't send the user anywhere. |
| 13 | Plugin opens the file that is already the current note | Recorded normally; harmless. |
| 14 | Two quick sidebar presses (overlapping `reorient()` runs) | Each run reads the record once; decision is pure and idempotent; `clearReturnRecord` is fire-and-forget. |
| 15 | Resumed on Daily but the note belongs to Project P; user taps the Current tab | Shows P (D4: `currentItem` seeded on resume, only while Current isn't the tab on screen). |
| 16 | NOTE ↔ DOC (PDF/epub) are different host apps; does the JS instance survive an app switch? | Believed yes (same PluginHost). If not, the record is gone and the old behavior applies - safe either way; the landing log line shows which happened. |
| 17 | Unsent text in a quick-add field or a half-done inline edit when the plugin was hidden | Preserved on resume (state intact). |

## 9. Decisions (settled 2026-09-20)

- **D1** Sticky record: reopening from the same note keeps resuming.
- **D2** Come back to where the plugin was last left (live state), not to an open-time snapshot.
- **D3** Memory-only; no persistence across process restarts (also the simpler implementation).
- **D4** On resume, point the Current tab at the note's Project/Area when it has a valid one - but not while the Current tab is on screen.

## 10. Verification

Done: strict `tsc` over `domain/returnContext.ts`, `storage/returnRecord.ts`, `supernote/fileSystem.ts` and `App.tsx` (stub-typed scratch project); a scripted test of `normalizeNotePath`, `isRecordValid`, `decideLanding` (every landing kind, TTL, focus priority, path aliasing) and of the record slot's rollback / stale-undo behavior - all passing.

On-device checklist: (a) Daily → open a task's note → press plugin → still Daily, and Current tab now shows the note's Project; (b) same from Week, Inbox, Review, another Project's Current tab; (c) open another note manually → press → old behavior, then back to the first note by hand → old behavior; (d) linked DOC/PDF round trip; (e) Lasso capture inside the note, then sidebar press; (f) press the button repeatedly / after ✕ from the same note → keeps resuming; (g) read `App: reorient landing` log lines to confirm `current=` and `recorded=` use the same path form.

## 11. Out of scope

Per-note return history/stack; a Settings toggle to disable the behavior (add later only if wanted); persisting the record across process restarts; using `registerPluginLifeListener` (`onStart`/`onStop`) — available in the SDK but not needed, and its exact firing semantics on button re-press are unverified.
