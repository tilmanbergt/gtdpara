# Technical design: Daily todo filter refinement + "Unfocused next items" review step

Narrows which open tasks `buildDailyAggregate` surfaces on Daily view (requirements
clarified in chat, 2026-09-09/10), and adds a new Weekly Review step so a `#next`
task that drops off Daily because its Project/Area isn't focused doesn't go
invisible until the user happens to notice. Per this project's own workflow
(clarify → design → implement), nothing here is written to `src/` yet.

## 0. Requirements recap (as clarified in chat)

- **Due-date leg**: today, tomorrow, or overdue (was: today or overdue). A
  strict widening - nothing that qualified before stops qualifying.
- **`#next` leg**: only counts when the task's Project/Area is currently in
  **Daily** focus (was: any `#next` task, focus irrelevant). This *narrows*
  the rule - a `#next` task in an unfocused Project/Area no longer shows on
  Daily by itself.
- **The old "any open task in a focused Project/Area shows" clause is gone
  entirely.** Being in Daily focus no longer floods Daily with everything
  that item has open - it only lets that item's `#next` task(s) through.
- **New Review step**: flags Projects *and* Areas (both kinds) that have at
  least one open `#next` task but aren't in Daily focus - the items whose
  `#next` work just went quiet under the narrowed rule above. Per-task
  actions (Someday / Maybe / Done / Cancel) and a whole-item "Add to Daily
  focus" action.

Net effect worth restating since it's the whole reason the new step exists:
today, a `#next` task in some unfocused Project/Area shows on Daily
unconditionally. After this change it doesn't, unless it's also due
today/tomorrow/overdue - until either the item gets a Daily focus slot, or
Review's new step is visited and something is done about it. That's the
accepted trade-off from the chat round, not a gap to patch here.

## 1. `storage/dailyAggregate.ts` - the aggregation rule itself

**Current rule** (both the main items loop and the Inbox loop, module doc
comment + inline checks): open task shows if `flowState === 'next'` OR
`dueDate <= today` OR (main loop only) `cachedItem.dailyFocus`.

**New rule, main items loop:**

```ts
const isDueSoonOrOverdue = task.dueDate !== null && task.dueDate <= tomorrowDate;
const isFocusedNext = task.flowState === 'next' && cachedItem.dailyFocus;
if (isDueSoonOrOverdue || isFocusedNext) {
  tasks.push({item, taskIndex, task});
}
```

`tomorrowDate` is already computed at the top of `buildDailyAggregate` for
meeting filtering (`isoDateOffset(1, now)`) - reusing it means "today,
tomorrow, or overdue" collapses to one comparison (`dueDate <= tomorrowDate`)
rather than three separate checks, since any earlier date is also
`<= tomorrowDate`. No new date helper needed.

The Waiting For/Someday/Maybe hard-exclusion above this check is untouched -
it still wins over everything, so the only flow-state badge Daily can ever
show stays "Next" (`ui/TaskBadges.tsx`'s `'flat'` context, unchanged).

**Inbox loop - one real edge case, flagged rather than silently decided:**
Inbox tasks have no Project/Area, so there's nothing for the new `#next AND
dailyFocus` rule to check `dailyFocus` *on*. Two readings:

- (a) **Recommended.** Leave Inbox's `#next` leg as-is (unconditional,
  focus-blind) - only widen its due-date leg to `<= tomorrowDate` to match.
  An Inbox `#next` task keeps showing on Daily exactly like today; nothing
  about Inbox triage changes. This is what the module doc comment's existing
  "minus the daily-focus leg" phrasing already implies once you read the new
  rule as "the `#next` leg requires being in a focused item" - Inbox was
  already carved out of that leg entirely, so the carve-out just keeps
  applying.
- (b) Apply the letter of the new rule literally: since Inbox items can never
  be "in Daily focus," `#next` stops mattering for Inbox tasks too - only
  due-soon-or-overdue Inbox tasks would show. This would make every
  `#next`-tagged Inbox task invisible on Daily until triaged out of Inbox,
  which reads like an accidental regression more than an intended one.

Recommend (a) - flagged in §9 as worth a one-line confirmation before
implementing, since it's a real interpretive call the chat round didn't
cover explicitly.

**Doc comment**: the module's top comment (lines 12-28) gets rewritten to
describe the new rule and this Inbox carve-out explicitly, same as every
other feature here updates the file's own doc comment as part of the change,
not after.

**Nothing else in this file changes.** `groupDailyTasksByItem`'s focused-first
group ordering uses `domain/destination.ts`'s `isFocused` (daily OR weekly) -
a different, broader check than the new `#next` rule's daily-only test, and
it's about *display order* of groups, not task membership - no change needed
there.

## 2. `storage/reviewAggregate.ts` - the new "unfocused next items" bucket

New types, alongside the existing `ReviewShelvedTaskEntry`/`ReviewProjectEntry`:

```ts
export interface ReviewNextTaskEntry {
  item: ReviewItemRef;
  /** Index into that item's *full* tasks array (CachedItem.tasks) - same convention as ReviewShelvedTaskEntry. */
  taskIndex: number;
  task: Task;
}

export interface ReviewUnfocusedNextEntry {
  item: ReviewItemRef;
  /** This item's own open (#next, not done/cancelled) tasks - see nextTasksFor. */
  nextTasks: ReviewNextTaskEntry[];
}
```

`ReviewAggregate` gains `unfocusedNextItems: ReviewUnfocusedNextEntry[]`.

New exported helper, mirroring `isActionableOpenTask`/`shelvedTasksFor`'s
existing export-for-live-recompute pattern:

```ts
/**
 * This item's own open (#next, not done, not cancelled) tasks - the set the
 * "Unfocused next items" review step (2026-09-10) surfaces per item.
 * Exported so ReviewScreen.tsx can recompute a frozen card's task list live
 * against the current cache, same reason isActionableOpenTask/shelvedTasksFor
 * are exported.
 */
export function nextTasksFor(item: ReviewItemRef, tasks: Task[]): ReviewNextTaskEntry[] {
  return tasks
    .map((task, taskIndex) => ({item, taskIndex, task}))
    .filter(({task}) => !task.done && !task.cancelled && task.flowState === 'next');
}
```

In `buildReviewAggregate`'s existing per-item loop, alongside the
done/on-hold/stalled checks:

```ts
if (cachedItem.status === 'active' && !cachedItem.dailyFocus) {
  const nextTasks = nextTasksFor(item, cachedItem.tasks);
  if (nextTasks.length > 0) {
    unfocusedNextItems.push({item, nextTasks});
  }
}
```

Applies to both Projects and Areas (the loop already iterates both kinds
undifferentiated, same as the stalled/neglected checks) - matches "Projects
and Areas, Daily focus" from the chat round. No overlap with
`stalledProjects`/`neglectedAreas` is possible: those require *zero*
actionable open tasks, and a `#next` task always counts as actionable
(`isActionableOpenTask` only excludes Someday/Maybe), so an item can never
be in both buckets at once.

## 3. `screens/ReviewScreen.tsx` - the new step

**Step list.** Insert before "Weekly focus reset" (not at the end) - it's a
focus-triage step, thematically paired with focus reset right after it, and
this keeps "Weekly focus reset" as the review's actual closing step with the
Finish button, unchanged:

```ts
const STEP_TITLES = [
  'Overview',
  'Week ahead',
  'Inbox to zero',
  'Stalled projects',
  'Done awaiting review',
  'On Hold reconsideration',
  'Neglected areas',
  'Unfocused next items', // new
  'Weekly focus reset',
];
const UNFOCUSED_NEXT_STEP = STEP_TITLES.indexOf('Unfocused next items');
```

`STEP_COUNT`/`STALLED_STEP`/`NEGLECTED_STEP` are already computed from
`STEP_TITLES.indexOf(...)`/`.length`, so they need no change.

**Frozen-snapshot plumbing**, extended exactly like the existing
`stalledSnapshot`/`neglectedSnapshot` pair (module doc comment's "Frozen
snapshots" section - same rationale applies: a card shouldn't vanish mid-triage
just because one of its `#next` tasks got resolved):

- New state: `const [unfocusedNextSnapshot, setUnfocusedNextSnapshot] = useState<ReviewUnfocusedNextEntry[] | null>(null);`
- `load(forceRebuild)`: add `setUnfocusedNextSnapshot(null)` alongside the
  other two resets when `forceRebuild`.
- The post-load freeze `useEffect` (lines 421-426): add
  `if (step === UNFOCUSED_NEXT_STEP && unfocusedNextSnapshot === null) setUnfocusedNextSnapshot(aggregate.unfocusedNextItems);`
- `goToStep`: add the matching refreeze-on-entry line.
- Derived list/pagination, alongside `stalledList`/`stalledPaged`:
  ```ts
  const unfocusedNextList = unfocusedNextSnapshot ?? aggregate?.unfocusedNextItems ?? [];
  const unfocusedNextPaged = usePagination(unfocusedNextList, PAGE_SIZE.review);
  ```

**New handlers**, alongside the existing `handlePromoteToNext`/
`handleStalled*`/`handleToggleItemWeeklyFocus`:

```ts
/**
 * One #next task's Someday/Maybe/Done/Cancel action from the Unfocused-next-
 * items step - same findCachedItem/saveTasks/updateItemTasks write-through
 * as every other task mutation on this screen. Someday/Maybe reuse
 * setFlowStateTag (same as handlePromoteToNext, opposite direction); Done/
 * Cancel set the task's own boolean flag directly, same soft-delete
 * convention as everywhere else (nothing is ever removed from the file).
 */
const handleUnfocusedNextTaskAction = async (
  entry: ReviewNextTaskEntry,
  action: 'someday' | 'maybe' | 'done' | 'cancel',
): Promise<void> => {
  const cachedItem = findCachedItem(entry.item.path);
  const current = cachedItem?.tasks[entry.taskIndex];
  if (!cachedItem || !current) {
    throw new Error(`"${entry.task.text}" changed on disk - tap 🔄 to refresh.`);
  }
  const nextTasks = cachedItem.tasks.slice();
  if (action === 'done') {
    nextTasks[entry.taskIndex] = {...current, done: true};
  } else if (action === 'cancel') {
    nextTasks[entry.taskIndex] = {...current, cancelled: true};
  } else {
    const nextText = setFlowStateTag(current.text, action);
    nextTasks[entry.taskIndex] = {...current, text: nextText, ...deriveTaskFields(nextText)};
  }
  const nextRaw = await saveTasks(entry.item.kind, entry.item.path, cachedItem.rawContent, nextTasks, cachedItem.taskExtraLines);
  updateItemTasks(entry.item.path, nextRaw, nextTasks, cachedItem.taskExtraLines);
  log('ReviewScreen: unfocused-next task action', action, entry.item.path, entry.taskIndex);
  refreshFromCache();
};

/**
 * "Add to Daily focus" on an Unfocused-next-items card - same
 * focusBlockedReason-then-setItemFocus pattern handleToggleItemWeeklyFocus
 * uses, just scope: 'daily' and always turning the flag on (this button only
 * ever adds - there's nothing to remove here, unlike Focus Reset's toggle
 * rows). Explicit resolution, so - like handleStalledArchive et al. - it also
 * drops the card from the frozen snapshot immediately.
 */
const handleAddToDailyFocus = async (itemRef: ReviewItemRef): Promise<void> => {
  const cachedItem = findCachedItem(itemRef.path);
  if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - tap 🔄 to refresh.`);
  if (!settings) throw new Error('Settings not loaded yet - tap 🔄 to refresh.');
  const reason = focusBlockedReason(items, cachedItem.kind, 'daily', settings);
  if (reason) throw new Error(reason);
  await setItemFocus(
    {
      kind: cachedItem.kind,
      path: cachedItem.path,
      rawContent: cachedItem.rawContent,
      status: cachedItem.status,
      dailyFocus: cachedItem.dailyFocus,
      weeklyFocus: cachedItem.weeklyFocus,
      frontMatterExtraLines: cachedItem.frontMatterExtraLines,
      defaultResourceFolder: cachedItem.defaultResourceFolder,
      area: cachedItem.area,
    },
    'daily',
    true,
  );
  log('ReviewScreen: added to daily focus', itemRef.path);
  refreshFromCache();
  bump('dailyFocusAdded');
  setUnfocusedNextSnapshot(prev => (prev ?? []).filter(e => e.item.path !== itemRef.path));
};
```

Card *membership* in the step stays frozen until `handleAddToDailyFocus`
resolves it (same rule as Stalled/Neglected) - resolving individual tasks via
`handleUnfocusedNextTaskAction` does **not** drop the card early, even if it
empties out a card's `nextTasks` entirely. That mirrors how a Stalled card
stays put after a task gets added to it until an explicit status
change/archive - consistent, but flagged in §9 since "card with zero next
tasks left, still sitting there" is a slightly different shape than Stalled's
"card with open tasks now, still sitting there."

**New card component**, `UnfocusedNextCard` - structurally close to
`ReviewItemCard` (frozen entry + live recompute of its task list against
`items`) but a different action set, so it's its own function rather than
overloading `ReviewItemCard` with a second unrelated prop surface:

```tsx
function UnfocusedNextCard({
  entry,
  items,
  onOpenItem,
  onTaskAction,
  onAddToFocus,
  textColor,
  borderColor,
}: {
  entry: ReviewUnfocusedNextEntry;
  items: CachedItem[];
  onOpenItem: (item: ReviewItemRef) => void;
  onTaskAction: (entry: ReviewNextTaskEntry, action: 'someday' | 'maybe' | 'done' | 'cancel') => Promise<void>;
  onAddToFocus: (item: ReviewItemRef) => Promise<void>;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingIndex, setActingIndex] = useState<number | null>(null);

  const runCardAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    fn().catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => setPending(false));
  };

  const runTaskAction = (taskEntry: ReviewNextTaskEntry, action: 'someday' | 'maybe' | 'done' | 'cancel') => {
    setError(null);
    setActingIndex(taskEntry.taskIndex);
    onTaskAction(taskEntry, action)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setActingIndex(null));
  };

  const current = items.find(i => i.path === entry.item.path);
  const nextTasks = current ? nextTasksFor(entry.item, current.tasks) : entry.nextTasks;

  return (
    <View style={[styles.card, {borderColor}]}>
      <Pressable onPress={() => onOpenItem(entry.item)}>
        <Text style={[styles.cardTitle, {color: textColor}]}>
          {entry.item.name}
          {entry.item.kind === 'area' ? ' (Area)' : ''}
        </Text>
      </Pressable>
      {nextTasks.length === 0 ? (
        <Text style={[styles.hint, {color: textColor}]}>No next tasks left on this item.</Text>
      ) : (
        <View style={styles.sectionSpacingSmall}>
          {nextTasks.map(taskEntry => (
            <View key={taskEntry.taskIndex} style={styles.shelvedRow}>
              <Text style={[styles.rowText, {color: textColor}]}>{taskEntry.task.text}</Text>
              <View style={styles.pillRow}>
                {(['someday', 'maybe', 'done', 'cancel'] as const).map(action => (
                  <Pressable
                    key={action}
                    style={[styles.pill, {borderColor}]}
                    disabled={actingIndex !== null}
                    onPress={() => runTaskAction(taskEntry, action)}
                    hitSlop={8}>
                    <Text style={[styles.pillText, {color: textColor}]}>
                      {action === 'someday' ? 'Someday' : action === 'maybe' ? 'Maybe' : action === 'done' ? 'Done' : 'Cancel'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={styles.pillRow}>
        <Pressable
          style={[styles.pill, styles.pillActive, {borderColor}]}
          disabled={pending}
          onPress={() => runCardAction(() => onAddToFocus(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>+ Add to Daily focus</Text>
        </Pressable>
      </View>
      {error && <Text style={[styles.error, {color: textColor}]}>⚠ {error}</Text>}
    </View>
  );
}
```

No `QuickAddWidget` on this card - see §9, flagged as a recommend-no rather
than an unconsidered omission.

**Renderer + wiring into `STEP_RENDERERS`:**

```tsx
const renderUnfocusedNextItems = () => (
  <View>
    {unfocusedNextList.length === 0 && (
      <Text style={[styles.hint, {color: textColor}]}>
        Nothing here - every #next item is either due soon or already in Daily focus.
      </Text>
    )}
    {unfocusedNextPaged.pageItems.map(entry => (
      <UnfocusedNextCard
        key={entry.item.path}
        entry={entry}
        items={items}
        onOpenItem={openReviewItem}
        onTaskAction={handleUnfocusedNextTaskAction}
        onAddToFocus={handleAddToDailyFocus}
        textColor={textColor}
        borderColor={borderColor}
      />
    ))}
    {unfocusedNextList.length > 0 && (
      <PageControls
        page={unfocusedNextPaged.page}
        totalPages={unfocusedNextPaged.totalPages}
        canPrev={unfocusedNextPaged.canPrev}
        canNext={unfocusedNextPaged.canNext}
        onPrev={unfocusedNextPaged.goPrev}
        onNext={unfocusedNextPaged.goNext}
        textColor={textColor}
        borderColor={borderColor}
      />
    )}
  </View>
);

const STEP_RENDERERS = [
  renderOverview,
  renderWeekAhead,
  renderInboxZero,
  renderStalledProjects,
  renderDoneProjects,
  renderOnHold,
  renderNeglectedAreas,
  renderUnfocusedNextItems, // new
  renderFocusReset,
];
```

## 4. `domain/settings.ts` - recap counter

`handleAddToDailyFocus` above bumps a counter for the Overview step's recap,
same convention as every other action on this screen. The existing
`focusAdded` field's summary line hardcodes "added to **weekly** focus" -
reusing it for a daily-focus add would silently mislabel the recap.
Recommended fix, small and self-contained:

```ts
export interface ReviewSummaryCounts {
  tasksAdded: number;
  inboxCleared: number;
  projectsActivated: number;
  areasActivated: number;
  reactivated: number;
  onHold: number;
  markedDone: number;
  archived: number;
  weeklyFocusAdded: number; // renamed from focusAdded
  dailyFocusAdded: number; // new
}
```

`ZERO_REVIEW_SUMMARY` gains the renamed/new fields (both 0).
`ReviewScreen.tsx`'s `handleToggleItemWeeklyFocus` bump call becomes
`bump('weeklyFocusAdded')` (was `bump('focusAdded')`); `summaryLines()` gets
a matching new line for `dailyFocusAdded` alongside the renamed one:

```ts
if (counts.weeklyFocusAdded > 0) lines.push(`${plural(counts.weeklyFocusAdded, 'item')} added to weekly focus`);
if (counts.dailyFocusAdded > 0) lines.push(`${plural(counts.dailyFocusAdded, 'item')} added to daily focus`);
```

A previously-saved `lastReviewSummary` blob with the old `focusAdded` key
just reads as `undefined` → falls out of `summaryLines`' `> 0` checks
harmlessly (this is a purely cosmetic recap, not audited data - same
"deliberately coarse, not hard to get wrong" posture the feature was built
with). Flagged in §9 in case keeping the old field name (and just adding
`dailyFocusAdded` alongside it, unrenamed) is preferred to minimize diff.

## 5. Verification plan

Same conventions this codebase already uses (`gtdpara_project.md`'s
standing note: standalone Node scripts for domain/storage logic + a
persistent `tsc --noEmit` scratch project, no Jest):

- `verify-aggregate.ts` (or wherever the existing Daily-filter cases live)
  gains cases for: due-tomorrow now included; a `#next` task in an unfocused
  item no longer included; a `#next` task in a focused item still included;
  a `#next`-and-overdue task in an unfocused item included (via the due leg,
  not the next leg - same task, two independent qualifying reasons is fine);
  the Inbox `#next`-unconditional carve-out (§1's flagged decision) covered
  explicitly so a future change can't silently flip it.
- A new case set (same script or a sibling) for `nextTasksFor`/
  `unfocusedNextItems`: an active unfocused item with one open `#next` task
  is included; the same item once focused is excluded; Someday/Maybe/Waiting
  For/done/cancelled tasks never count; an on-hold/done item with a stray
  `#next` tag is excluded.
- Scratch-project `tsc --noEmit` + `eslint` pass across every touched file,
  same as the project's standing recommendation for work done without
  on-device build access.
- On-device smoke test once built: an item with an unfocused `#next` task
  disappears from Daily; the same item shows up in Review's new step;
  Someday/Maybe/Done/Cancel each resolve that one task without touching the
  card's own membership; "Add to Daily focus" both makes the card disappear
  from this step *and* makes that item's `#next` task(s) reappear on Daily;
  the focus-slot-full block message shows correctly when triggered from this
  new card.

## 6. Explicitly unchanged / out of scope

- `storage/focusSlots.ts` - no changes, reused as-is (`focusBlockedReason`/
  `setItemFocus`, `scope: 'daily'`).
- `ui/TaskBadges.tsx`, `domain/flowState.ts` - no changes; the "Next" badge
  and `setFlowStateTag` are reused exactly as they exist today.
- Weekly focus / step 9 (`renderFocusReset`) - untouched, still the review's
  closing step with "Finish review."
- The concurrent, not-yet-implemented `docs/dev/technical-design-daily-focus-
  panel.md` (Daily's Focus/Projects/Areas mini-tab panel redesign) - touches
  `DailyView.tsx`'s *layout* and the Focus section's own browsing/picking UI,
  not `dailyAggregate.ts`'s task-filter rule this doc changes. No expected
  overlap, but worth knowing it exists before either lands, since both touch
  `DailyView.tsx`.
- Adding new tasks from the new step's cards (`QuickAddWidget`) - see §9,
  recommended against for now, not silently dropped.

## 7. File-by-file summary

| File | Change |
|---|---|
| `src/storage/dailyAggregate.ts` | Rewrite the inclusion rule (main + Inbox loops) and its doc comment - §1. |
| `src/storage/reviewAggregate.ts` | New `ReviewNextTaskEntry`/`ReviewUnfocusedNextEntry` types, `nextTasksFor`, `unfocusedNextItems` on `ReviewAggregate` + the aggregation loop - §2. |
| `src/screens/ReviewScreen.tsx` | New step (`STEP_TITLES`/`STEP_RENDERERS`), snapshot state + effects, `handleUnfocusedNextTaskAction`/`handleAddToDailyFocus`, `UnfocusedNextCard`, `renderUnfocusedNextItems` - §3. `handleToggleItemWeeklyFocus`'s bump call renamed - §4. |
| `src/domain/settings.ts` | `ReviewSummaryCounts`: rename `focusAdded` → `weeklyFocusAdded`, add `dailyFocusAdded`; `ZERO_REVIEW_SUMMARY` matches - §4. |
| `docs/dev/design-overview.md` | Update §2.10's aggregation-rule paragraph and §2.13's step list/count once implemented (also a good moment to fix §2.13's already-stale "7 steps"/missing-Overview description - a pre-existing gap noted in project memory, not introduced by this change). |
| `src/ui/TaskBadges.tsx`, `src/domain/flowState.ts`, `src/storage/focusSlots.ts` | No changes - §6. |

## 8. Open questions to confirm before implementation

1. **Inbox `#next` carve-out** (§1): keep Inbox `#next` tasks showing
   unconditionally (recommended) vs. also require some form of "focus" that
   doesn't really exist for Inbox, which would just hide them. Recommend
   keeping them unconditional.
2. **A card whose last `#next` task just got resolved away** (§3): stays on
   screen until "Add to Daily focus" (frozen-snapshot consistency,
   recommended) vs. auto-drops once `nextTasks` is empty. Recommend staying,
   for consistency with Stalled/Neglected's existing behavior.
3. **`ReviewSummaryCounts.focusAdded` rename** (§4): rename to
   `weeklyFocusAdded` + add `dailyFocusAdded` (recommended, keeps the recap
   text accurate) vs. leave the existing field name alone and only add
   `dailyFocusAdded` (smaller diff, but the old field's line would need
   relabeling to "weekly" anyway to stay accurate, or the two would need
   separate wording chosen some other way).
4. **No quick-add on the new cards** (§3/§6): this step only lets you act on
   *existing* `#next` tasks and add the item to focus - no "add a task"
   affordance, unlike Stalled/Neglected's cards. Recommend leaving it out
   (this step's job is triage, not creation) but flagging since every other
   card-shaped step on this screen has one.
5. **Step placement**: right before "Weekly focus reset" (recommended,
   §3) vs. somewhere else in the order (e.g. right after "Neglected areas,"
   which is the same position numerically but framed as "next to the other
   two project/area triage steps" rather than "next to focus reset").
   Functionally identical either way since it's adjacent to both; asking in
   case the framing matters to you.

None of these block writing the code - all are narrow and easy to flip - but
worth a quick yes/no pass first, same as this project's other recent
technical-design docs do.
